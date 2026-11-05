"""질의 도구 — 에이전트가 부르는 읽기 전용 도구. 숫자는 모두 코드가 셉니다. 모양(이름 · 설명 · JSON 인자 · 결과)은 MCP 도구와 같게 둡니다."""
from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import cached_property
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..context.person import full as person_sections
from ..db import User, auth, results
from ..sources import (MODULE_LABELS, People, SecurityEvent, Sources, between, parse_datetime, search, server_digest,
                       summarize, user_label, vocabulary)

# 모델에 주는 도구 결과 한 건의 글자 수 · 줄 수 상한입니다 (화면에는 evidence 를 그대로 줍니다).
TEXT_CHARS = 3000
LOG_LINES = 20
SERVER_LINES = 40
FINDING_LINES = 30


@dataclass
class Context:
    """한 질문 동안 도구가 나눠 쓰는 자료 — 로그 · 사람은 처음 쓸 때 한 번만 읽습니다."""

    sources: Sources
    user: User | None = None
    ip: str | None = None
    now: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @cached_property
    def events(self) -> list[SecurityEvent]:
        return self.sources.events().records

    @cached_property
    def people(self) -> People:
        return self.sources.people(self.events)

    @cached_property
    def vocabulary(self) -> dict[str, Any]:
        return vocabulary(self.events)


@dataclass
class ToolResult:
    """text 는 모델에, 나머지는 화면 근거(칩 · 패널)에 갑니다."""

    text: str
    summary: str
    facts: dict[str, Any] | None = None
    evidence: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    criteria: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    run: Callable[[Context, Any], ToolResult]

    def spec(self) -> dict[str, Any]:
        """MCP 도구 정의와 같은 모양입니다."""
        return {"name": self.name, "description": self.description, "inputSchema": self.args.model_json_schema()}

    def openai(self) -> dict[str, Any]:
        """bind_tools 에 넘기는 모양입니다."""
        return {"type": "function", "function": {"name": self.name, "description": self.description,
                                                 "parameters": self.args.model_json_schema()}}

    def call(self, ctx: Context, raw: dict[str, Any]) -> ToolResult:
        return self.run(ctx, self.args.model_validate(raw or {}))


def _clip(text: str, limit: int = TEXT_CHARS) -> str:
    return text if len(text) <= limit else text[:limit] + "\n… (입력 한도로 뒤를 뺐습니다)"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


# --- 기준 문서 ---


class RegulationArgs(BaseModel):
    query: str = Field(description="찾을 내용 — 질문의 핵심 말 (예: 급여 테이블 접근 권한)")


def _regulations(ctx: Context, a: RegulationArgs) -> ToolResult:
    docs = ctx.sources.documents.search(a.query)
    sources = list(dict.fromkeys(d.metadata.get("source", "?") for d in docs))
    if not docs:
        return ToolResult("찾은 조항이 없습니다. 기준 문서가 적재되지 않았을 수 있습니다.", "조항 없음")
    text = "\n\n".join(f"[{d.metadata.get('source', '?')}] {d.page_content}" for d in docs)
    return ToolResult(_clip(text), f"기준 문서 조각 {len(docs)}개", evidence=[d.page_content for d in docs], sources=sources,
                      criteria={"query": a.query})


# --- DLP 로그 ---


class LogArgs(BaseModel):
    user: str = Field("", description="사람 — 이름 · 부서+이름 · 로그 사용자 ID. 사람 이름은 반드시 이 칸에 (keyword 아님)")
    department: str = Field("", description="부서")
    solution: str = Field("", description="보안 솔루션 (예: DLP, SecureMark)")
    where: str = Field("", description="어디서 (예: 출력, VDI)")
    how: str = Field("", description="행위 (예: 출력, 예외 승인)")
    keyword: str = Field("", description="그 밖의 항목 — '항목=값' 이면 그 값과 같은 로그, 아니면 항목 글에 든 말. 사람 이름은 넣지 않음")
    since: str = Field("", description="시작 시각 ISO 8601 (질문에 기간이 없으면 비움)")
    until: str = Field("", description="끝 시각 ISO 8601 (질문에 기간이 없으면 비움)")


def _who(ctx: Context, word: str) -> bool:
    w = word.strip().casefold()
    return bool(w) and any(w in u.casefold() for u in ctx.vocabulary["users"])


# 값이 몇 개뿐인 칸입니다 — 로그에 없는 값은 빼고, 쉼표 목록은 '또는'으로 봅니다.
CHOICES = {"solution": "solutions", "where": "where", "how": "how"}


def _choices(ctx: Context, a: LogArgs) -> tuple[LogArgs, dict[str, list[str]], list[str]]:
    """→ (한 값만 남긴 인자, 여러 값 칸, 로그에 없어 뺀 조건)"""
    either: dict[str, list[str]] = {}
    dropped: list[str] = []
    for name, vocab in CHOICES.items():
        parts = [p.strip() for p in getattr(a, name).split(",") if p.strip()]
        known = [p for p in parts if any(p.casefold() in v.casefold() for v in ctx.vocabulary[vocab])]
        dropped += [f"{name}={p}" for p in parts if p not in known]
        if len(known) > 1:
            either[name] = known
        a = a.model_copy(update={name: known[0] if len(known) == 1 else ""})
    return a, either, dropped


def _match(events: list[SecurityEvent], a: LogArgs, either: dict[str, list[str]]) -> list[SecurityEvent]:
    found = search(events, a.user, a.department, a.solution, a.where, a.how, a.keyword)
    return [e for e in found if all(any(p.casefold() in getattr(e, f).casefold() for p in ps) for f, ps in either.items())]


def _logs(ctx: Context, a: LogArgs) -> ToolResult:
    # 모델이 사람 이름을 keyword 에 넣던 버릇을 코드로 바로잡습니다.
    if a.keyword and "=" not in a.keyword and not a.user and _who(ctx, a.keyword):
        a = a.model_copy(update={"user": a.keyword, "keyword": ""})
    a, either, dropped = _choices(ctx, a)
    events = ctx.events
    try:
        since = parse_datetime(a.since) if a.since else None
        until = parse_datetime(a.until) if a.until else None
    except ValueError as exc:
        return ToolResult(f"기간을 읽지 못했습니다: {exc}", "기간 오류")
    # 로그 전체의 처음 · 끝을 기간으로 채운 것은 질문에 없던 기간이라 비웁니다.
    if events and since == min(e.occurred_at for e in events) and until == max(e.occurred_at for e in events):
        since = until = None
    window = between(events, since, until, include_since=True)
    matched = _match(window, a, either)
    criteria = {k: v for k, v in a.model_dump().items() if v and k not in ("since", "until")}
    criteria.update({k: ",".join(v) for k, v in either.items()})
    if since:
        criteria["since"] = since.isoformat()
    if until:
        criteria["until"] = until.isoformat()
    if ctx.user is not None:
        auth.record_log_view(ctx.sources.main_db, ctx.user, {"via": "ask", **criteria}, ctx.ip)
    facts = summarize(matched)
    lines = [e.describe() for e in matched]
    notes = ""
    if dropped:
        notes += f"[뺀 조건 — 로그에 없는 값] {', '.join(dropped)}\n"
    if not matched and len(criteria) > 1:
        # 조건 하나만 걸었을 때의 건수 — 질문에 없던 조건을 채워 0건이 된 것인지 모델이 알아보게 합니다.
        single = {}
        for k, v in criteria.items():
            if k in ("since", "until"):
                single[k] = len(window)
            else:
                one = LogArgs(**{k: v}) if k not in either else LogArgs()
                single[f"{k}={v}"] = len(_match(window, one, {k: either[k]} if k in either else {}))
        notes += f"[조건 하나씩 걸었을 때 건수] {_json(single)} — 질문에 없던 조건이면 빼고 다시 부르십시오\n"
    text = (f"{notes}[조건] {_json(criteria) if criteria else '없음 (전체)'}\n[집계 — 숫자는 여기서만]\n{_json(facts)}\n"
            f"[로그 — 최근 {min(len(lines), LOG_LINES)}줄 / 전체 {len(lines)}줄]\n" + "\n".join(lines[-LOG_LINES:]))
    return ToolResult(_clip(text), f"로그 {facts['count']}건", facts=facts, evidence=lines[-50:], criteria=criteria)


# --- 서버 ---

MODULES = tuple(MODULE_LABELS.values())


class ServerArgs(BaseModel):
    nodes: str = Field("", description="노드 이름 (쉼표로 여럿). 호스트 · IP 로 물어도 노드 이름으로. 비우면 전부")
    module: Literal["", "UFW", "SSH", "PAM", "계정 · sudo"] = Field("", description="모듈 — UFW(방화벽) · SSH · PAM(로그인 잠금) · 계정 · sudo. 비우면 전부")
    since: str = Field("", description="기록을 볼 시작 시각 ISO 8601 (지금 상태만 물으면 비움)")
    until: str = Field("", description="기록을 볼 끝 시각 ISO 8601")


def _servers(ctx: Context, a: ServerArgs) -> ToolResult:
    everyone, _ = ctx.sources.servers(None)
    wanted = [w.strip() for w in a.nodes.split(",") if w.strip()]
    names = [n["node"] for n in everyone if not wanted or any(w in (n["node"], n["host"], n["ip"]) for w in wanted)]
    unknown = [w for w in wanted if not any(w in (n["node"], n["host"], n["ip"]) for n in everyone)]
    current, history = ctx.sources.servers(names, a.since or None, a.until or None)
    digest = server_digest(current, history, a.module)
    criteria = {k: v for k, v in a.model_dump().items() if v}
    head = f"[모르는 노드] {', '.join(unknown)}\n" if unknown else ""
    lines = digest["lines"]
    text = (head + f"[조건] {_json(criteria) if criteria else '없음 (전체)'}\n[집계 — 숫자는 여기서만]\n{_json(digest['facts'])}\n"
            "[지금 상태]\n" + "\n".join(digest["state"])
            + (f"\n[기간 안 기록 — 최근 {min(len(lines), SERVER_LINES)}줄]\n" + "\n".join(lines[-SERVER_LINES:]) if lines else ""))
    return ToolResult(_clip(text), f"서버 {len(current)}대", facts=digest["facts"], evidence=digest["state"] + lines[-60:],
                      criteria=criteria)


# --- 사람 ---


class PersonArgs(BaseModel):
    who: str = Field(description="사람 — 이름 · 아이디 · 로그 사용자 ID · '부서 이름'")


def _matches(ctx: Context, who: str) -> list[tuple[int | None, str, str]]:
    """→ (계정 id, 로그 사용자 ID, 보이는 이름)"""
    w = who.strip().casefold()
    out: list[tuple[int | None, str, str]] = []
    for a in ctx.people.accounts:
        if w in {(a["display_name"] or "").casefold(), (a["login_id"] or "").casefold(), (a["log_id"] or "").casefold()} \
                or w == f"{a['department'] or ''} {a['display_name']}".strip().casefold():
            out.append((a["id"], a["log_id"] or "", f"{a['department'] or ''} {a['display_name']}".strip()))
    linked = {o[1] for o in out if o[1]}
    for log_id, group in ctx.people.by_log.items():
        label = user_label(group[0])
        if log_id not in linked and (w == log_id.casefold() or w in label.casefold()):
            out.append((None, log_id, label))
    return out


def _person(ctx: Context, a: PersonArgs) -> ToolResult:
    found = _matches(ctx, a.who)
    if not found:
        return ToolResult(f"'{a.who}'에 맞는 계정 · 로그 사용자가 없습니다.", "사람 없음", criteria={"who": a.who})
    if len(found) > 1:
        names = ", ".join(n for _, _, n in found)
        return ToolResult(f"'{a.who}'에 맞는 사람이 여럿입니다: {names}. 누구인지 되물으세요.", f"후보 {len(found)}명",
                          criteria={"who": a.who})
    account_id, log_id, name = found[0]
    p = ctx.people.get(account_id, log_id)
    lines = [line for s in person_sections(p) for line in s.lines]
    return ToolResult(_clip(f"[사람] {name}\n" + "\n".join(lines)), name, evidence=lines, criteria={"who": a.who})


# --- AI 판정 결과 ---


class FindingArgs(BaseModel):
    kind: Literal["events", "policies", "suspects"] = Field(
        description="events = 로그 감시 판정(주의 · 위험), policies = 정책 관리 검토의 문제, suspects = 위협 예측(의심 점수)")
    who: str = Field("", description="사람으로 거름 (events · suspects). 비우면 전부")


def _findings(ctx: Context, a: FindingArgs) -> ToolResult:
    db, w = ctx.sources.results_db, a.who.strip().casefold()
    lines: list[str] = []
    if a.kind == "events":
        found = (results.monitor_findings(db) or {}).get("findings", [])
        found = [f for f in found if f["level"] in ("주의", "위험") and (not w or w in f["subject"].casefold() or w in f["user"].casefold())]
        lines = [f"- {f['last_event_at'][:16]} {f['subject']} — {f['level']}{' (1차)' if f['stage'] == 'fast' else ''}: {f['reason']}"
                 f" [근거 {', '.join(f['sources']) or '없음'}]" for f in found]
        sources = [s for f in found for s in f["sources"]]
    elif a.kind == "policies":
        review = results.latest_policy_review(db)
        issues = (review or {}).get("issues", [])
        lines = [f"- {i['kind']} · {i['level']} — {', '.join(i['policy_ids'])}: {i['reason']} → {i['recommendation']}" for i in issues]
        sources = [s for i in issues for s in i["policy_ids"]]
        if review:
            lines.insert(0, f"[검토 {review['generated_at'][:16]}] {review['summary']}")
    else:
        found = [p for p in results.latest_suspects(db) if not w or w in p["subject"].casefold() or w in (p["log_id"] or "").casefold()]
        lines = [f"- {p['subject']} — {p['score']}점 {p['level']}: {p['reason']} / 확인할 점: {p['watch']}" for p in found if not p["failed"]]
        sources = []
    label = {"events": "로그 감시 판정", "policies": "정책 문제", "suspects": "의심 점수"}[a.kind]
    body = "\n".join(lines[-FINDING_LINES:]) if lines else "없음"
    return ToolResult(_clip(f"[{label}] {len(lines)}건\n{body}"), f"{label} {len(lines)}건", evidence=lines,
                      sources=list(dict.fromkeys(sources)), criteria={k: v for k, v in a.model_dump().items() if v})


TOOLS: dict[str, Tool] = {t.name: t for t in (
    Tool("search_regulations", "기준 문서(사내 보안 정책 · 접근권한 기준)에서 조항을 찾습니다. 정책 · 기준 · 허용 여부를 물으면 먼저 부릅니다.",
         RegulationArgs, _regulations),
    Tool("find_logs", "보안 솔루션 로그(DLP 등)를 조건으로 거르고 셉니다. 몇 번 · 몇 장 · 누가 · 언제 같은 로그 질문에 씁니다. 숫자는 결과의 집계에서만 옮깁니다.",
         LogArgs, _logs),
    Tool("servers", "수집 노드가 보낸 서버 상태(UFW · SSH · PAM · 계정 · sudo)와 서버 점검 결과, 기간 안 설정 변경 기록을 봅니다.",
         ServerArgs, _servers),
    Tool("person", "한 사람의 계정 · 부서 이동 · 지금 가진 권한 · 권한 신청 기록 · 로그 요약 · 행동 신호를 봅니다.", PersonArgs, _person),
    Tool("findings", "AI 가 이미 낸 판정을 봅니다 — 로그 감시 판정 · 정책 관리 검토의 문제 · 위협 예측 의심 점수.", FindingArgs, _findings),
)}

__all__ = ["TOOLS", "Context", "Tool", "ToolResult"]
