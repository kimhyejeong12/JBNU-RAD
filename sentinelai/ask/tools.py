"""질의 도구 — 에이전트가 부르는 읽기 전용 도구. 숫자는 모두 코드가 셉니다. 모양(이름 · 설명 · JSON 인자 · 결과)은 MCP 도구와 같게 둡니다."""
from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from functools import cached_property
from typing import Any, Literal

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from ..context import Prompts
from ..context.person import full as person_sections
from ..db import User, auth, lookup, results
from ..db.core import today
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
    llm: Any = None  # query 의 meaning 이 후보 행을 고를 때 씁니다.

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


# --- 권한 DB 구조화 조회 ---

DATASETS = {"grants": "지금 가진 권한", "requests": "권한 신청", "accounts": "계정", "catalog": "권한 목록", "moves": "부서 이동"}
_PERSON_FIELDS = ("name", "login_id", "department", "job", "is_active", "left_on", "log_id")
_REQUEST_FIELDS = ("request_no", *_PERSON_FIELDS, "code", "access", "system", "category", "reason", "period_start", "period_end",
                   "stage", "submitted_at", "closed_at", "ai_level", "manager_name", "manager_comment", "top_name", "top_comment",
                   "top_decided_at", "revoke_reason")
# 대상마다 거르기 · 고르기 · 정렬에 쓸 수 있는 칸입니다 (lookup 이 읽은 칸 중 화면에도 보이는 것만).
FIELDS = {
    "grants": _REQUEST_FIELDS,
    "requests": _REQUEST_FIELDS,
    "accounts": (*_PERSON_FIELDS, "role", "created_at"),
    "catalog": ("code", "name", "system", "category", "description", "is_active"),
    "moves": (*_PERSON_FIELDS, "from_department", "from_job", "to_department", "to_job", "moved_on"),
}
# 행을 가리키는 칸 — ids 로 고를 때 봅니다.
ID_FIELD = {"grants": "request_no", "requests": "request_no", "accounts": "login_id", "catalog": "code", "moves": "login_id"}
# 권한을 물을 때 흔히 붙지만 권한 목록을 고르는 데 쓸모없는 말입니다.
ACCESS_FILLER = ("권한", "접근", "가진", "보유", "사용자", "유저", "있는")
# meaning 으로 모델에 넘기는 후보 행 수 상한입니다.
MEANING_ROWS = 40
# 기간으로 거를 때 보는 칸입니다.
DATE_FIELD = {"grants": "top_decided_at", "requests": "submitted_at", "accounts": "created_at", "moves": "moved_on"}
TRUE_WORDS = {"true", "1", "예", "y", "yes", "활성", "켜짐"}
OPS = ("=", "!=", "contains", "not_contains", ">", ">=", "<", "<=", "empty", "not_empty")


class Condition(BaseModel):
    field: str = Field(description="칸 이름 — 대상마다 쓸 수 있는 칸은 도구 설명에")
    op: Literal["=", "!=", "contains", "not_contains", ">", ">=", "<", "<=", "empty", "not_empty"] = Field(
        "=", description="= · != 는 같음 · 다름, contains 는 글에 듦, 크기 비교는 날짜(YYYY-MM-DD)에, empty 는 빈 칸")
    value: str = Field("", description="값 (empty · not_empty 는 비움)")


class QueryArgs(BaseModel):
    dataset: Literal["grants", "requests", "accounts", "catalog", "moves"] = Field(
        description="grants = 지금 가진 권한(승인되고 사용 기간 안), requests = 권한 신청 전부(결재 단계, AI 등급, 결재 의견), "
                    "accounts = 계정(부서, 직무, 역할, 퇴사일), catalog = 신청할 수 있는 권한 목록, moves = 부서와 직무 이동")
    access: str = Field("", description="권한 — 이름, 코드, 시스템의 말 (예: 급여 테이블, HR_MASTER). 권한 목록에서 비슷한 것을 찾아 거름")
    who: str = Field("", description="사람 — 이름, 아이디, 로그 사용자 ID")
    department: str = Field("", description="부서 (일부만 써도 됨)")
    stage: Literal["", "1차 결재 대기", "최종 결재 대기", "승인", "반려", "철회", "회수", "만료"] = Field(
        "", description="requests 의 결재 단계. 만료 = 승인됐지만 사용 기간이 끝남")
    ai_level: Literal["", "정상", "주의", "위험", "없음"] = Field("", description="grants · requests 의 AI 판정 등급 (없음 = 판정 없음)")
    expires_within: int = Field(0, ge=0, le=365, description="grants · requests — 오늘부터 이 일수 안에 사용 기간이 끝나는 것만 (0 이면 안 거름)")
    since: str = Field("", description="시작 날짜 ISO 8601 — grants 는 승인일, requests 는 신청일, moves 는 이동일 (질문에 기간이 없으면 비움)")
    until: str = Field("", description="끝 날짜 ISO 8601 (질문에 기간이 없으면 비움)")
    where: list[Condition] = Field(default_factory=list, description="그 밖의 칸 조건 (모두 맞는 것만)")
    ids: list[str] = Field(default_factory=list, description="이 행만 — 신청 번호(grants · requests), 아이디(accounts · moves), 코드(catalog). "
                                                              "뜻으로 골라낸 행을 다시 셀 때 씀")
    meaning: str = Field("", description="뜻을 봐야 하는 조건 (예: 신청 사유가 신청한 권한과 맞지 않음). 다른 인자로 거른 뒤 남은 행을 읽고 맞는 것만 고름")
    group_by: Literal["", "person", "department", "access", "system", "stage", "job", "role", "ai_level"] = Field(
        "", description="묶어 셀 칸 — 사람별, 부서별, 권한별 몇 건인지 물으면")
    fields: list[str] = Field(default_factory=list, description="행에 보여 줄 칸만 (비우면 기본 모양)")
    sort: str = Field("", description="정렬할 칸, 앞에 - 를 붙이면 큰 것부터 (예: -submitted_at)")
    limit: int = Field(30, ge=1, le=100, description="보여 줄 줄 수 (집계는 전체로 셈)")


def _norm(text: str) -> str:
    return "".join((text or "").split()).casefold()


def _access_items(items: list[dict], text: str) -> list[dict] | None:
    """권한 목록에서 말이 가장 많이 겹치는 것들 — 거를 말이 없으면 None 입니다."""
    words = []
    for word in text.split():
        w = _norm(word)
        for filler in ACCESS_FILLER:
            w = w.replace(filler, "")
        if w:
            words.append(w)
    if not words:
        return None
    hays = [(_norm(" ".join([i["code"], i["name"], i["system"], i["category"], i["description"]])), i) for i in items]

    def hit(w: str, hay: str) -> bool:
        # 조사가 붙은 말(급여테이블의)도 한 글자 떼어 봅니다.
        return w in hay or (len(w) > 2 and w[:-1] in hay)

    scored = [(sum(hit(w, hay) for w in words), i) for hay, i in hays]
    best = max((n for n, _ in scored), default=0)
    return [i for n, i in scored if best and n == best]


def _is(row: dict, who: str) -> bool:
    w = who.strip().casefold()
    name = (row.get("name") or "").casefold()
    return w in name or w in {(row.get("login_id") or "").casefold(), (row.get("log_id") or "").casefold(),
                             f"{row.get('department') or ''} {row.get('name') or ''}".strip().casefold()}


def _value(row: dict, field_name: str) -> str:
    v = row.get(field_name)
    if isinstance(v, bool):
        return "예" if v else "아니오"
    return "" if v is None else str(v)


def _holds(row: dict, c: Condition) -> bool:
    raw = row.get(c.field)
    if isinstance(raw, bool) and c.op in ("=", "!="):
        return (raw == (c.value.strip().casefold() in TRUE_WORDS)) == (c.op == "=")
    v, want = _value(row, c.field).casefold(), c.value.strip().casefold()
    if c.op == "empty":
        return not v
    if c.op == "not_empty":
        return bool(v)
    if c.op == "contains":
        return want in v
    if c.op == "not_contains":
        return want not in v
    if c.op == "=":
        return v == want
    if c.op == "!=":
        return v != want
    # 크기 비교는 빈 칸을 빼고, 앞부분 길이를 맞춰 날짜 · 시각을 견줍니다.
    if not v:
        return False
    v = v[:len(want)] if c.op in ("<=", ">") else v
    return {">": v > want, ">=": v >= want, "<": v < want, "<=": v <= want}[c.op]


def _person_text(r: dict) -> str:
    extra = [r["job"] or "직무 없음"] + ([f"퇴사 {r['left_on']}"] if r["left_on"] else []) + ([] if r["is_active"] else ["비활성"])
    return f"이름 {r['name']}, 부서 {r['department'] or '없음'} ({', '.join(extra)})"


def _line(dataset: str, r: dict, fields: list[str]) -> str:
    if fields:
        keys = list(dict.fromkeys([ID_FIELD[dataset], *fields]))
        return "- " + ", ".join(f"{k} {_value(r, k) or '없음'}" for k in keys)
    if dataset == "grants":
        return (f"- {_person_text(r)} — {r['access']} [{r['code']}, {r['system'] or '시스템 없음'}] "
                f"사용 기간 끝 {r['period_end'] or '없음'}, 승인일 {(r['top_decided_at'] or '')[:10]}, 신청 번호 {r['request_no']}")
    if dataset == "requests":
        tail = "".join(f", {k} {v}" for k, v in (("1차 의견", r["manager_comment"]), ("최종 의견", r["top_comment"]),
                                                   ("회수 사유", r["revoke_reason"])) if v)
        return (f"- {r['request_no']} 신청일 {r['submitted_at'][:10]} {_person_text(r)} — {r['access']} [{r['code']}] "
                f"{r['stage']}{' (만료)' if r['expired'] else ''}, AI {r['ai_level'] or '없음'}, 사유: {r['reason'] or '없음'}{tail}")
    if dataset == "accounts":
        return (f"- {_person_text(r)} 아이디 {r['login_id']}, {r['role']}, {'활성' if r['is_active'] else '비활성'}, "
                f"로그 사용자 ID {r['log_id'] or '없음'}")
    if dataset == "catalog":
        return (f"- {r['code']} {r['name']} [{r['system'] or '시스템 없음'}, {r['category'] or '분류 없음'}] "
                f"{r['description']}{'' if r['is_active'] else ' (꺼짐)'}")
    return (f"- {r['moved_on']} 이름 {r['name']} 아이디 {r['login_id']}: {r['from_department'] or '없음'} {r['from_job']} → "
            f"{r['to_department'] or '없음'} {r['to_job']}")


GROUP_KEY: dict[str, Callable[[dict], str]] = {
    "person": lambda r: f"{r.get('department') or ''} {r.get('name') or ''}".strip(),
    "department": lambda r: r.get("department") or r.get("to_department") or "(없음)",
    "access": lambda r: f"{r.get('access') or r.get('name')} ({r.get('code')})",
    "system": lambda r: r.get("system") or "(없음)",
    "stage": lambda r: r.get("stage") or "(없음)",
    "job": lambda r: r.get("job") or r.get("to_job") or "(없음)",
    "role": lambda r: r.get("role") or "(없음)",
    "ai_level": lambda r: r.get("ai_level") or "(없음)",
}


def _bad_fields(a: QueryArgs) -> list[str]:
    allowed = FIELDS[a.dataset]
    named = [c.field for c in a.where] + list(a.fields) + ([a.sort.lstrip("-")] if a.sort else [])
    return [f for f in dict.fromkeys(named) if f not in allowed]


def _pick(ctx: Context, a: QueryArgs, rows: list[dict]) -> tuple[list[dict], dict[int, str]]:
    """후보 행을 번호로 모델에 보여 주고 고른 번호만 남깁니다 — 숫자는 고른 행으로 코드가 다시 셉니다."""
    numbered = "\n".join(f"{n}. {_line(a.dataset, r, [])[2:]}" for n, r in enumerate(rows, 1))
    reply = ctx.llm.invoke([HumanMessage(Prompts.AGENT_PICK.format(meaning=a.meaning, rows=numbered))])
    content = reply.content if isinstance(reply.content, str) else str(reply.content)
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.S)
    reasons: dict[int, str] = {}
    for m in re.finditer(r"^\s*[-*]?\s*(\d+)\s*[.:)：]\s*(.*)$", content, flags=re.M):
        n = int(m.group(1))
        if 1 <= n <= len(rows):
            reasons.setdefault(n, m.group(2).strip())
    return [rows[n - 1] for n in sorted(reasons)], {n: reasons[n] for n in sorted(reasons)}


def _query(ctx: Context, a: QueryArgs) -> ToolResult:
    db = ctx.sources.main_db
    criteria = {k: _json(v) if isinstance(v, list) else str(v) for k, v in a.model_dump().items() if v and k != "limit"}
    bad = _bad_fields(a)
    if bad:
        return ToolResult(f"{DATASETS[a.dataset]}에 없는 칸: {', '.join(bad)}. 쓸 수 있는 칸: {', '.join(FIELDS[a.dataset])}",
                          "칸 오류", criteria=criteria)
    items = lookup.catalog(db)
    picked = _access_items(items, a.access) if a.access else None
    if picked == []:
        names = ", ".join(f"{i['name']}({i['code']})" for i in items) or "없음"
        return ToolResult(f"'{a.access}'에 맞는 권한이 권한 목록에 없습니다. 권한 목록: {names}", "권한 없음", criteria=criteria)
    requests = lookup.requests(db) if a.dataset in ("grants", "requests") or picked else []
    rows = {"grants": lambda: [r for r in requests if r["held"]], "requests": lambda: requests,
            "accounts": lambda: lookup.accounts(db), "catalog": lambda: items, "moves": lambda: lookup.moves(db)}[a.dataset]()
    if picked is not None:
        codes = {i["code"] for i in picked}
        if a.dataset in ("accounts", "moves"):
            # 계정 · 이동은 그 권한을 지금 가진 사람으로 거릅니다.
            holders = {g["requester_id"] for g in requests if g["held"] and g["code"] in codes}
            rows = [r for r in rows if r["id" if a.dataset == "accounts" else "user_id"] in holders]
        else:
            rows = [r for r in rows if r["code"] in codes]
    if a.ids:
        wanted = {i.strip().casefold() for i in a.ids}
        rows = [r for r in rows if _value(r, ID_FIELD[a.dataset]).casefold() in wanted]
    if a.who:
        rows = [r for r in rows if _is(r, a.who)]
    if a.department:
        d = _norm(a.department)
        rows = [r for r in rows if d in _norm(r.get("department", "")) or d in _norm(r.get("to_department", ""))
                or d in _norm(r.get("from_department", ""))]
    if a.stage and a.dataset == "requests":
        rows = [r for r in rows if (r["expired"] if a.stage == "만료" else r["stage"] == a.stage)]
    if a.ai_level and a.dataset in ("grants", "requests"):
        rows = [r for r in rows if (r["ai_level"] or "없음") == a.ai_level]
    if a.expires_within and a.dataset in ("grants", "requests"):
        start = today()
        end = (date.fromisoformat(start) + timedelta(days=a.expires_within)).isoformat()
        rows = [r for r in rows if r["held"] and r["period_end"] and start <= r["period_end"] <= end]
    field_name = DATE_FIELD.get(a.dataset)
    if field_name and a.since:
        rows = [r for r in rows if (r[field_name] or "") >= a.since]
    if field_name and a.until:
        rows = [r for r in rows if (r[field_name] or "")[:len(a.until)] <= a.until]
    rows = [r for r in rows if all(_holds(r, c) for c in a.where)]
    reasons: dict[str, str] = {}
    if a.meaning:
        if ctx.llm is None:
            return ToolResult("meaning 은 지금 쓸 수 없습니다. 다른 인자로만 거르십시오.", "meaning 없음", criteria=criteria)
        if len(rows) > MEANING_ROWS:
            return ToolResult(f"meaning 으로 고르기에 후보가 {len(rows)}줄로 많습니다 ({MEANING_ROWS}줄까지). "
                              "질문에 있는 다른 조건으로 줄여 다시 부르십시오.", "후보 많음", criteria=criteria)
        candidates = len(rows)
        picked_rows, why = _pick(ctx, a, rows)
        reasons = {_value(r, ID_FIELD[a.dataset]): why[n] for n, r in zip(why, picked_rows)}
        rows = picked_rows
    if a.sort:
        key = a.sort.lstrip("-")
        rows = sorted(rows, key=lambda r: _value(r, key), reverse=a.sort.startswith("-"))
    facts: dict[str, Any] = {"count": len(rows)}
    if a.dataset in ("grants", "requests", "moves"):
        facts["people"] = len({GROUP_KEY["person"](r) for r in rows})
    if a.group_by:
        counts: dict[str, int] = {}
        for r in rows:
            k = GROUP_KEY[a.group_by](r)
            counts[k] = counts.get(k, 0) + 1
        facts["groups"] = dict(sorted(counts.items(), key=lambda kv: -kv[1]))
    if a.meaning:
        facts["candidates"] = candidates
    if a.ids:
        found = {_value(r, ID_FIELD[a.dataset]).casefold() for r in rows}
        missing = [i for i in a.ids if i.strip().casefold() not in found]
        if missing:
            facts["not_found"] = missing
    lines = [_line(a.dataset, r, a.fields) + (f" — 이번 질문의 조건에 맞는 이유(AI 판정 아님): {reasons[k]}" if (k := _value(r, ID_FIELD[a.dataset])) in reasons
                                                and reasons[k] else "") for r in rows]
    head = ""
    if a.meaning:
        head += f"[뜻으로 고름] 후보 {candidates}줄 중 '{a.meaning}'에 맞는 {len(rows)}줄 (모델이 고르고 코드가 셈)\n"
    if picked:
        head = "[거른 권한 — 아래 행은 이 가운데 하나] " + ", ".join(f"{i['name']}({i['code']}, {i['system']})" for i in picked) + "\n"
        if a.dataset in ("accounts", "moves"):
            head += "[거름] 그 권한을 지금 가진 사람만\n"
    if len(lines) > a.limit:
        head += f"[잘림] {len(lines)}줄 중 {a.limit}줄만 보입니다. 뜻으로 골라야 하면 조건을 더해 줄이십시오\n"
    text = (f"[{DATASETS[a.dataset]}] [조건] {_json(criteria) if criteria else '없음 (전체)'}\n{head}"
            f"[집계 — 숫자는 여기서만]\n{_json(facts)}\n[행 — {min(len(lines), a.limit)}줄 / 전체 {len(lines)}줄]\n"
            + ("\n".join(lines[:a.limit]) if lines else "없음"))
    return ToolResult(_clip(text), f"{DATASETS[a.dataset]} {len(rows)}건", facts=facts, evidence=lines[:100], criteria=criteria)


def _query_description() -> str:
    fields = "; ".join(f"{k}: {', '.join(v)}" for k, v in FIELDS.items())
    return ("권한 DB 를 조건으로 거르고 셉니다 — 누가 어떤 권한을 가졌는지, 신청 · 결재 현황, 계정 · 부서 · 직무, 권한 목록, 부서 이동. "
            "여러 사람에 걸친 질문(예: 급여 테이블 권한을 가진 사람)에 씁니다. 숫자는 결과의 집계에서만 옮깁니다. "
            f"where · fields · sort 에 쓸 수 있는 칸 — {fields}")


TOOLS: dict[str, Tool] = {t.name: t for t in (
    Tool("search_regulations", "기준 문서(사내 보안 정책 · 접근권한 기준)에서 조항을 찾습니다. 정책 · 기준 · 허용 여부를 물으면 먼저 부릅니다.",
         RegulationArgs, _regulations),
    Tool("find_logs", "보안 솔루션 로그(DLP 등)를 조건으로 거르고 셉니다. 몇 번 · 몇 장 · 누가 · 언제 같은 로그 질문에 씁니다. 숫자는 결과의 집계에서만 옮깁니다.",
         LogArgs, _logs),
    Tool("servers", "수집 노드가 보낸 서버 상태(UFW · SSH · PAM · 계정 · sudo)와 서버 점검 결과, 기간 안 설정 변경 기록을 봅니다.",
         ServerArgs, _servers),
    Tool("person", "한 사람의 계정 · 부서 이동 · 지금 가진 권한 · 권한 신청 기록 · 로그 요약 · 행동 신호를 봅니다.", PersonArgs, _person),
    Tool("findings", "AI 가 이미 낸 판정을 봅니다 — 로그 감시 판정 · 정책 관리 검토의 문제 · 위협 예측 의심 점수.", FindingArgs, _findings),
    Tool("query", _query_description(), QueryArgs, _query),
)}

__all__ = ["TOOLS", "Context", "Tool", "ToolResult"]
