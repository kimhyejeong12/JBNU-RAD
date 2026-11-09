"""질의 에이전트 — 기준 세우기 → 쿼리 → 골라내기 → 판단을 단계마다 질답 모델에 따로 묻고, 코드가 답을 검증합니다."""
from __future__ import annotations

import logging
import re
import time
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from pydantic import ValidationError

from ..context import Prompts
from ..db import User, nodes
from ..sources import Sources
from .check import check
from .tools import MODULES, TOOLS, Context, ToolResult

log = logging.getLogger(__name__)

MAX_STEPS = 5  # 도구를 부르는 모델 호출 횟수 상한입니다.
RESTARTS = 1  # 도구 없이 답하면 처음부터 다시 돌리는 횟수입니다.
HISTORY_TURNS = 4  # 이어 가는 대화에서 넣는 앞 턴 수입니다.
VOCAB_ITEMS = 40  # 어휘 한 줄에 넣는 값 수 상한입니다.
SPOT_CHARS = 12000  # 골라내기에 넣는 모은 자료의 글자 수 상한입니다 (도구마다 나눠 씀).
THINK = re.compile(r"<think>.*?</think>", re.S)
PLAN_LINE = re.compile(r"^\s*[-*]?\s*(목표|기준|자료|답 모양)\s*[:：]\s*(.*)$", re.M)
PLAN_KEYS = {"목표": "goal", "기준": "criteria", "자료": "needs", "답 모양": "form"}
SPOT_LINE = re.compile(r"^\s*[-*]?\s*\[?(T\d+-\d+)\]?\s*[:：.)]\s*(.*)$", re.M)


def _text(content: Any) -> str:
    if isinstance(content, list):
        content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    return str(content or "")


def clean(answer: str) -> str:
    """생각 블록 · 마크다운 굵게 · 제목 표시를 걷어냅니다."""
    answer = THINK.sub("", answer).replace("**", "").replace("__", "")
    answer = re.sub(r"^\s*[\[(](그때 찾은 것|앞서 찾은 것)[\]:].*$", "", answer, flags=re.M)
    return re.sub(r"^#{1,6}\s*", "", answer, flags=re.M).strip()


class Agent:
    def __init__(self, llm: Any, sources: Sources, max_steps: int = MAX_STEPS) -> None:
        self.llm = llm
        self.sources = sources
        self.max_steps = max_steps
        self.bound = llm.bind_tools([t.openai() for t in TOOLS.values()])

    def system(self, ctx: Context) -> str:
        v = ctx.vocabulary
        cut = lambda xs: ", ".join(xs[:VOCAB_ITEMS]) + (f" 외 {len(xs) - VOCAB_ITEMS}" if len(xs) > VOCAB_ITEMS else "")  # noqa: E731
        registry = [f"{n['name']}({n['host'] or '-'}, {n['ip'] or '-'})" for n in nodes.list_nodes(self.sources.main_db)]
        lines = [
            f"- 로그 사용자: {cut(v['users']) or '없음'}",
            f"- 부서: {cut(v['departments']) or '없음'}",
            f"- 솔루션: {cut(v['solutions']) or '없음'} / 어디서: {cut(v['where']) or '없음'} / 행위: {cut(v['how']) or '없음'}",
            f"- 로그 항목: {cut(v['attributes']) or '없음'}",
            f"- 로그 기간: {v['first'] or '-'} ~ {v['last'] or '-'} (질문에 기간이 없으면 쓰지 않음)",
            f"- 노드: {cut(registry) or '없음'}",
            f"- 서버 모듈: {', '.join(MODULES)}",
        ]
        now = ctx.now.astimezone().isoformat(timespec="seconds")
        return Prompts.AGENT_BASE.format(now=now, vocabulary="\n".join(lines))

    def _history(self, history: list[dict[str, Any]]) -> list[BaseMessage]:
        out: list[BaseMessage] = []
        # 도구 없이 낸 답 · 실패한 턴은 근거가 없어 넣지 않습니다 — 모델이 그 답을 흉내 냅니다.
        grounded = [t for t in history if t.get("steps") and not t.get("failed")]
        for turn in grounded[-HISTORY_TURNS:]:
            # 도구 요약은 질문 쪽에 붙입니다 — 답 쪽에 두면 모델이 그 모양을 답에 베낍니다.
            found = "; ".join(s["summary"] + (f" — 조건 {', '.join(f'{k} {v}' for k, v in s['criteria'].items())}" if s.get("criteria") else "")
                             for s in turn.get("steps") or [])
            out.append(HumanMessage(turn["question"] + (f"\n(앞서 찾은 것: {found})" if found else "")))
            out.append(AIMessage(turn["answer"] or turn.get("error") or ""))
        return out

    def _call(self, ctx: Context, call: dict[str, Any]) -> tuple[ToolResult | None, str | None]:
        tool = TOOLS.get(call.get("name", ""))
        if tool is None:
            return None, f"모르는 도구입니다: {call.get('name')}. 쓸 수 있는 도구: {', '.join(TOOLS)}"
        try:
            return tool.call(ctx, call.get("args") or {}), None
        except ValidationError as exc:
            return None, f"인자 오류: {exc.errors(include_url=False)}"
        except Exception as exc:  # noqa: BLE001 — 도구 하나가 실패해도 모델이 다른 길을 찾게 합니다.
            log.exception("질의 도구 %s 실패", tool.name)
            return None, f"도구 실행 실패: {exc}"

    def _run(self, ctx: Context, call: dict[str, Any], steps: list[dict[str, Any]], texts: dict[int, str], by: str = "model") -> str:
        """도구 하나를 부르고 단계에 남깁니다 → 모델에 돌려줄 글."""
        res, error = self._call(ctx, call)
        step: dict[str, Any] = {"tool": call.get("name"), "args": call.get("args") or {}}
        if by != "model":
            step["by"] = by
        if res is None:
            step.update(summary="실패", error=error)
            steps.append(step)
            return error or ""
        step.update(summary=res.summary, facts=res.facts, evidence=res.evidence, sources=res.sources, criteria=res.criteria)
        steps.append(step)
        texts[len(steps)] = res.text
        return res.text

    def _loop(self, ctx: Context, messages: list[BaseMessage], steps: list[dict[str, Any]], texts: dict[int, str]) -> None:
        """2단계 쿼리 — 도구 호출을 max_steps 번까지 돌립니다. 모델의 마지막 글은 쓰지 않습니다."""
        for _ in range(self.max_steps):
            reply = self.bound.invoke(messages)
            messages.append(reply)
            if not reply.tool_calls:
                return
            for call in reply.tool_calls:
                content = self._run(ctx, call, steps, texts)
                messages.append(ToolMessage(content, tool_call_id=call.get("id") or ""))
        log.info("도구 호출 한도(%d)에 닿아 다음 단계로 넘어갑니다", self.max_steps)

    def _plan(self, base: list[BaseMessage], question: str) -> dict[str, str]:
        """1단계 기준 세우기 — 도구 없이 목표 · 기준 · 자료 · 답 모양을 적게 합니다."""
        reply = self.llm.invoke([*base, HumanMessage(f"{question}\n\n{Prompts.AGENT_PLAN}")])
        text = clean(_text(reply.content))
        plan = {"text": text}
        for m in PLAN_LINE.finditer(text):
            plan.setdefault(PLAN_KEYS[m.group(1)], m.group(2).strip())
        return plan

    @staticmethod
    def _pool(steps: list[dict[str, Any]], texts: dict[int, str]) -> list[dict[str, Any]]:
        """모은 자료를 줄마다 번호(T도구-줄)로 — 도구마다 SPOT_CHARS 를 나눠 앞에서부터 담습니다."""
        share = SPOT_CHARS // max(len(texts), 1)
        pool: list[dict[str, Any]] = []
        for n, text in texts.items():
            used = 0
            for i, line in enumerate((x for x in text.split("\n") if x.strip()), 1):
                used += len(line)
                if used > share:
                    break
                pool.append({"id": f"T{n}-{i}", "step": n, "tool": steps[n - 1]["tool"], "line": line})
        return pool

    def _spot(self, system: str, question: str, plan: dict[str, str], pool: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], bool]:
        """4단계 골라내기 — 모델이 고른 번호 중 실제로 있는 줄만 남깁니다. → (고른 줄, 골라내지 못해 전부 씀)"""
        if not pool:
            return [], False
        lines = "\n".join(f"{p['id']} | {p['line']}" for p in pool)
        reply = self.llm.invoke([SystemMessage(system), HumanMessage(Prompts.AGENT_SPOT.format(question=question, plan=plan["text"], lines=lines))])
        text = clean(_text(reply.content))
        by_id = {p["id"]: p for p in pool}
        why: dict[str, str] = {}
        for m in SPOT_LINE.finditer(text):
            if m.group(1) in by_id:
                why.setdefault(m.group(1), m.group(2).strip())
        if not why and text.strip() != "없음":
            return [{**p, "why": ""} for p in pool], True
        # 행을 고른 도구의 [집계] 줄은 늘 넣습니다 — 숫자 · 건수를 판단 단계가 직접 세지 않게.
        for step in {by_id[i]["step"] for i in why}:
            lines = [p for p in pool if p["step"] == step]
            for a, b in zip(lines, lines[1:]):
                if a["line"].startswith("[집계") and b["id"] not in why:
                    why[b["id"]] = "집계 (코드가 넣음)"
        order = lambda kv: [int(x) for x in kv[0][1:].split("-")]  # noqa: E731
        return [{**by_id[i], "why": w} for i, w in sorted(why.items(), key=order)], False

    @staticmethod
    def _evidence(steps: list[dict[str, Any]], spotted: list[dict[str, Any]]) -> str:
        """고른 줄을 도구마다 묶고, 어느 조건으로 찾은 줄인지 머리에 적습니다."""
        out: list[str] = []
        for n in dict.fromkeys(p["step"] for p in spotted):
            step = steps[n - 1]
            cond = ", ".join(f"{k} {v}" for k, v in (step.get("criteria") or {}).items())
            out.append(f"[{step['tool']} — {step['summary']}{', 조건 ' + cond if cond else ''}]")
            out += [p["line"] for p in spotted if p["step"] == n]
        return "\n".join(out) or "없음 (찾은 자료가 없습니다)"

    def ask(self, question: str, history: list[dict[str, Any]] | None = None, user: User | None = None,
            ip: str | None = None) -> dict[str, Any]:
        """기준 세우기 → 쿼리(거르기는 도구 안 코드) → 골라내기 → 판단을 단계마다 따로 부르고 코드가 검증합니다."""
        started = time.monotonic()
        ctx = Context(self.sources, user=user, ip=ip, llm=self.llm)
        steps: list[dict[str, Any]] = []
        texts: dict[int, str] = {}
        restarts = 0
        stages: dict[str, Any] = {"times": {}}

        def lap(name: str, since: float) -> float:
            stages["times"][name] = round(time.monotonic() - since, 1)
            return time.monotonic()

        try:
            system = self.system(ctx)
            past = self._history(history or [])
            t = time.monotonic()
            plan = self._plan([SystemMessage(system), *past], question)
            stages["plan"] = plan
            t = lap("plan", t)
            while True:
                prompt = question if restarts == 0 else f"{question}\n\n{Prompts.AGENT_RETRY}"
                messages: list[BaseMessage] = [SystemMessage(system + "\n\n" + Prompts.AGENT_QUERY.format(plan=plan["text"])), *past,
                                               HumanMessage(prompt)]
                self._loop(ctx, messages, steps, texts)
                # 도구 없이 끝낸 쿼리는 근거가 없어 처음부터 다시 돌립니다.
                if steps or restarts >= RESTARTS:
                    break
                restarts += 1
                log.info("도구 없이 끝내 쿼리를 처음부터 다시 돕니다 (%d/%d)", restarts, RESTARTS)
            # 기준에 기준 문서가 걸렸는데 조항을 찾지 않았으면 코드가 목표로 찾습니다 — 판단 단계가 조항을 지어내지 않게.
            if "기준 문서" in plan.get("criteria", "") and not any(st["tool"] == "search_regulations" and st.get("summary") != "실패"
                                                                  for st in steps):
                self._run(ctx, {"name": "search_regulations", "args": {"query": plan.get("goal") or question}}, steps, texts, by="code")
            t = lap("query", t)
            pool = self._pool(steps, texts)
            spotted, fallback = self._spot(system, question, plan, pool)
            stages.update(pool=len(pool), fallback=fallback,
                          spotted=[{k: p[k] for k in ("id", "tool", "line", "why")} for p in spotted])
            t = lap("spot", t)
            evidence = self._evidence(steps, spotted)
            reply = self.llm.invoke([SystemMessage(system), *past,
                                     HumanMessage(Prompts.AGENT_JUDGE.format(question=question, plan=plan["text"], evidence=evidence))])
            lap("judge", t)
            answer = clean(_text(reply.content))
            if not answer:
                meta = reply.response_metadata
                raise ValueError(f"모델이 빈 답을 냈습니다 (done_reason={meta.get('done_reason')}, "
                                 f"입력 {meta.get('prompt_eval_count')} · 출력 {meta.get('eval_count')} 토큰)")
        except Exception as exc:  # noqa: BLE001 — 실패도 같은 모양으로 돌려 화면 · 기록이 한 길로 갑니다.
            log.exception("질의 실패")
            return {"answer": "", "steps": steps, "sources": [], "checks": [], "restarts": restarts, "stages": stages, "failed": True,
                    "error": str(exc), "elapsed_sec": round(time.monotonic() - started, 1)}
        sources = list(dict.fromkeys(s for step in steps for s in step.get("sources") or []))
        # 판단 단계가 본 것(고른 근거)만으로 검증합니다.
        checks = check(answer, question, [evidence])
        if not steps:
            checks.insert(0, "도구로 찾지 않고 답했습니다")
        elif fallback:
            checks.insert(0, "근거를 골라내지 못해 모은 자료 전부로 판단했습니다")
        elif not spotted:
            checks.insert(0, "모은 자료에서 답에 쓸 근거를 고르지 못했습니다")
        return {"answer": answer, "steps": steps, "sources": sources, "checks": checks, "restarts": restarts, "stages": stages,
                "failed": False, "error": None, "elapsed_sec": round(time.monotonic() - started, 1)}


__all__ = ["Agent", "clean"]
