"""질의 에이전트 — 질답 모델이 도구를 골라 부르고, 찾은 것으로 답한 뒤 코드가 답을 검증합니다."""
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
THINK = re.compile(r"<think>.*?</think>", re.S)


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
        return Prompts.AGENT.format(now=now, vocabulary="\n".join(lines))

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

    def _loop(self, ctx: Context, messages: list[BaseMessage], steps: list[dict[str, Any]], texts: list[str]) -> AIMessage | None:
        """도구 호출을 max_steps 번까지 돌리고 마지막 답 메시지를 돌려줍니다."""
        reply: AIMessage | None = None
        for _ in range(self.max_steps):
            reply = self.bound.invoke(messages)
            messages.append(reply)
            if not reply.tool_calls:
                return reply
            for call in reply.tool_calls:
                res, error = self._call(ctx, call)
                step: dict[str, Any] = {"tool": call.get("name"), "args": call.get("args") or {}}
                if res is None:
                    step.update(summary="실패", error=error)
                    content = error or ""
                else:
                    step.update(summary=res.summary, facts=res.facts, evidence=res.evidence, sources=res.sources,
                                criteria=res.criteria)
                    content = res.text
                    texts.append(res.text)
                steps.append(step)
                messages.append(ToolMessage(content, tool_call_id=call.get("id") or ""))
        return self.llm.invoke([*messages, HumanMessage(Prompts.AGENT_WRAP)])

    def ask(self, question: str, history: list[dict[str, Any]] | None = None, user: User | None = None,
            ip: str | None = None) -> dict[str, Any]:
        started = time.monotonic()
        ctx = Context(self.sources, user=user, ip=ip)
        steps: list[dict[str, Any]] = []
        texts: list[str] = []
        restarts = 0
        try:
            while True:
                prompt = question if restarts == 0 else f"{question}\n\n{Prompts.AGENT_RETRY}"
                messages: list[BaseMessage] = [SystemMessage(self.system(ctx)), *self._history(history or []), HumanMessage(prompt)]
                reply = self._loop(ctx, messages, steps, texts)
                # 도구 없이 낸 답은 근거가 없어 버리고 처음부터 다시 돌립니다.
                if steps or restarts >= RESTARTS:
                    break
                restarts += 1
                log.info("도구 없이 답해 처음부터 다시 돕니다 (%d/%d)", restarts, RESTARTS)
            answer = clean(_text(reply.content if reply else ""))
            if not answer:
                meta = reply.response_metadata if reply else {}
                raise ValueError(f"모델이 빈 답을 냈습니다 (done_reason={meta.get('done_reason')}, "
                                 f"입력 {meta.get('prompt_eval_count')} · 출력 {meta.get('eval_count')} 토큰)")
        except Exception as exc:  # noqa: BLE001 — 실패도 같은 모양으로 돌려 화면 · 기록이 한 길로 갑니다.
            log.exception("질의 실패")
            return {"answer": "", "steps": steps, "sources": [], "checks": [], "restarts": restarts, "failed": True, "error": str(exc),
                    "elapsed_sec": round(time.monotonic() - started, 1)}
        sources = list(dict.fromkeys(s for step in steps for s in step.get("sources") or []))
        checks = check(answer, question, texts)
        if not steps:
            checks.insert(0, "도구로 찾지 않고 답했습니다")
        return {"answer": answer, "steps": steps, "sources": sources, "checks": checks, "restarts": restarts,
                "failed": False, "error": None, "elapsed_sec": round(time.monotonic() - started, 1)}


__all__ = ["Agent", "clean"]
