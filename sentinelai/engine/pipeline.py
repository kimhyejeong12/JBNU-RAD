"""판정 흐름 — 체인(프롬프트 + 검색 + 모델)과 데이터를 체인에 돌려 결과 dict 를 내는 흐름."""
from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable, RunnablePassthrough

from .. import ROOT
from ..context import Built, Person, builders
from ..sources import (
    LoadResult,
    ServerSnapshot,
    ServerState,
    between,
    group_by_user,
    inventory,
    latest,
    load_events,
    load_policies,
    load_servers,
    optional,
    parse_datetime,
    period_since,
    search,
    server_digest,
    snapshot_changes,
    snapshot_from_payload,
    summarize,
    user_label,
    vocabulary,
)
from .prompt import Prompts
from .rag import IndexReport, lookup_all
from .types import Answer, LogFilter, PolicyReview, ServerFilter, ServerReview, SuspectScore, Verdict

if TYPE_CHECKING:
    from .engine import Engine

log = logging.getLogger(__name__)


# 판정 체인은 프롬프트와 모델뿐입니다. 입력(대상 · 사람 · 규정 RAG)은 context 의 빌더가 만듭니다.


def review_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    return engine.chain(Prompts.ACCESS_REVIEW, Verdict, **kwargs)


def grant_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    return engine.chain(Prompts.GRANT_REVIEW, Verdict, **kwargs)


def policy_chain(engine: Engine, structured: bool = True, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    return engine.chain(Prompts.POLICY_CONFLICT, PolicyReview if structured else None, **kwargs)


def server_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    return engine.chain(Prompts.SERVER_REVIEW, ServerReview, **kwargs)


def event_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    return engine.chain(Prompts.EVENT_REVIEW, Verdict, **kwargs)


def suspect_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    return engine.chain(Prompts.SUSPECT, SuspectScore, **kwargs)


# 로그는 RAG 로 찾지 않습니다. 집계 질문은 비슷한 몇 줄만 찾으면 건수가 틀립니다.


def log_filter_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: question, vocabulary, now(UTC)"""
    return engine.chain(Prompts.LOG_FILTER, LogFilter, **{"llm": engine.qa_llm, **kwargs})


def log_answer_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: question, criteria, facts, lines"""
    return engine.chain(Prompts.LOG_ANSWER, None, **{"llm": engine.qa_llm, **kwargs})


def server_filter_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: question, vocabulary, now(UTC)"""
    return engine.chain(Prompts.SERVER_FILTER, ServerFilter, **{"llm": engine.qa_llm, **kwargs})


def server_answer_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: question, criteria, state, facts, lines"""
    return engine.chain(Prompts.SERVER_ANSWER, None, **{"llm": engine.qa_llm, **kwargs})


def answer_chain(engine: Engine, structured: bool = False, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: context, question"""
    return engine.chain(Prompts.ANSWER, Answer if structured else None, **{"llm": engine.qa_llm, **kwargs})


def rag_chain(engine: Engine, structured: bool = False, k: int | None = None, **kwargs: Any) -> Runnable[str, Any]:
    """입력: 질문 문자열"""
    return {"context": lookup_all(engine, k), "question": RunnablePassthrough()} | answer_chain(engine, structured, **kwargs)


DOCS_DIR = ROOT / "docs"
RETRIES = 2
# 건수 · 합계는 전체로 세므로 이 줄 수에 묶이지 않습니다.
LOG_LINES = 50
BROWSE_PAGE = 100

Progress = Callable[[int, int, dict[str, Any]], None]


def attempt(call: Callable[[], Any], retries: int = RETRIES) -> tuple[Any | None, str | None, float]:
    """→ (결과 또는 None, 마지막 실패 원인, 소요 초)"""
    started = time.time()
    error = None
    for _ in range(retries + 1):
        try:
            return call(), None, time.time() - started
        except Exception as exc:  # 구조화 출력 파싱 실패 · 연결 오류 모두 다시 시도합니다.
            error = f"{type(exc).__name__}: {exc}"
    return None, error, time.time() - started


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _loaded(result: LoadResult) -> dict[str, Any]:
    return {"generated_at": _now(), "source": result.source, "load_issues": [str(i) for i in result.issues]}


def _judged(verdict: Any, error: str | None, elapsed: float) -> dict[str, Any]:
    base = {"failed": verdict is None, "error": error, "elapsed_sec": round(elapsed, 1)}
    return {**verdict.model_dump(), **base} if verdict is not None else base


def index_documents(engine: Engine, source: Any = DOCS_DIR, rebuild: bool = False) -> IndexReport:
    return engine.documents.index(source, rebuild=rebuild)


def _judge(chain: Runnable[dict[str, Any], Any], built: Built) -> dict[str, Any]:
    verdict, error, elapsed = attempt(lambda: chain.invoke(built.inputs))
    if built.trimmed:
        log.info("판정 입력 %s자 (한도 %s자) — 줄인 칸 %s", built.chars, built.limit, built.trimmed)
    return {**_judged(verdict, error, elapsed), "input": {"chars": built.chars, "limit": built.limit, "trimmed": built.trimmed}}


def judge_request(engine: Engine, row: dict[str, Any], person: Person) -> dict[str, Any]:
    """신청 1건 → 신청 행의 AI 칸에 저장할 dict. person 은 신청 시각까지의 기록입니다."""
    return _judge(engine.review_chain(), builders.request(engine.settings, Prompts.ACCESS_REVIEW, engine.regulations, row, person))


def judge_grant(engine: Engine, row: dict[str, Any], person: Person) -> dict[str, Any]:
    """row 는 신청 행 + move. → grant_reviews 에 쌓을 dict"""
    return _judge(engine.grant_chain(), builders.grant(engine.settings, Prompts.GRANT_REVIEW, engine.regulations, row, person))


def review_policies(engine: Engine, policies_source: Any, decided: list[str], progress: Progress | None = None) -> dict[str, Any]:
    """정책 폴더가 비면 RAG 의 규칙을 지웁니다 — 예전 규칙이 다른 검색에 섞이지 않게."""
    policies = optional(load_policies, policies_source)
    index_documents(engine)
    if not policies.records:
        engine.documents.clear_rules()
        empty = {"summary": "솔루션 정책이 없어 정책 간 검토를 하지 않았습니다 (RAG 의 예전 규칙도 지웠습니다).", "issues": [],
                 "failed": False, "error": None, "elapsed_sec": 0.0}
        if progress:
            progress(1, 1, empty)
        return {**_loaded(policies), "rules": [], **empty}
    engine.documents.index_rules(policies.source, [r.describe() for r in policies.records])
    built = builders.policy(engine.settings, Prompts.POLICY_CONFLICT, engine.regulations, policies.records, decided)
    rules_part = _judge(engine.policy_chain(), built)
    if progress:
        progress(1, 1, rules_part)
    return {**_loaded(policies), "rules": [r.model_dump() for r in policies.records], **rules_part}


def snapshot_row(payload: dict[str, Any], node: str, previous: dict[str, Any] | None) -> dict[str, Any]:
    """형식이 틀리면 ValueError. 늦게 도착한 옛 수집은 바뀐 것을 세지 않습니다."""
    snap = snapshot_from_payload(payload, node)
    at = snap.collected_at.isoformat(timespec="seconds")
    newer = previous is None or at > previous["collected_at"]
    return {**snap.model_dump(mode="json", exclude={"raw"}), "collected_at": at,
            "changes": snapshot_changes(previous and previous["modules"], snap.modules) if newer else []}


def check_nodes(engine: Engine, snapshots: list[dict[str, Any]], policies_source: Any, servers_source: Any,
                decided: Callable[[str], list[str]], progress: Progress | None = None) -> dict[str, Any]:
    """새 수집이 온 노드마다 판정합니다. decided(노드) = 그 노드에 운영자가 정한 것."""
    policies = optional(load_policies, policies_source)
    servers = optional(load_servers, servers_source)
    found = inventory(servers.records)
    if snapshots:
        index_documents(engine)
    findings = []
    chain = engine.server_chain()
    for n, snap in enumerate(snapshots, start=1):
        server = found.get(snap["host"].lower()) or found.get(snap["ip"]) or ServerState(host=snap["host"], ip=snap["ip"])
        snapshot = ServerSnapshot(**{k: snap[k] for k in ("node", "host", "ip", "collected_at", "collected_by", "modules")})
        built = builders.server(engine.settings, Prompts.SERVER_REVIEW, engine.regulations, server, snapshot, snap["changes"],
                                policies.records, decided(snap["node"]))
        finding = {"node": snap["node"], "snapshot_id": snap["id"], "host": snap["host"], "ip": snap["ip"] or server.ip,
                   "state": server.raw, "matched": built.inputs["matched"], **_judge(chain, built)}
        findings.append(finding)
        if progress:
            progress(n, len(snapshots), finding)
    return {"findings": findings, "load_issues": [str(i) for i in policies.issues + servers.issues]}


def monitor(
    engine: Engine,
    loaded: LoadResult,
    person: Callable[[str], Person],
    since: datetime | None = None,
    until: datetime | None = None,
    progress: Progress | None = None,
    fast: bool = False,
) -> dict[str, Any]:
    """loaded = 로그 전체, person(로그 사용자 ID) = 그 사람의 맥락. 빠른 감시는 계정 · 지금 가진 권한만 봅니다."""
    window = between(loaded.records, since, until)
    findings = []
    groups = group_by_user(window)
    chain = engine.event_chain(llm=engine.fast_llm) if fast else engine.event_chain()
    prompt = Prompts.EVENT_REVIEW
    for n, (user, events) in enumerate(groups.items(), start=1):
        built = builders.events(engine.settings, prompt, engine.regulations, events, person(user), fast)
        last = latest(events)
        finding = {
            # 같은 사용자가 다음 실행에도 나올 수 있어 마지막 로그 시각을 붙입니다.
            "id": f"{user}@{last.isoformat()}",
            "user": user,
            "first_event_at": events[0].occurred_at.isoformat(),
            "last_event_at": last.isoformat(),
            "subject": built.inputs["subject"],
            "events": "\n".join(e.describe() for e in events),
            **_judge(chain, built),
        }
        findings.append(finding)
        # 알림(Notifier)을 붙이면 여기서 보냅니다.
        if progress:
            progress(n, len(groups), finding)
    last_event = latest(window)
    return {
        **_loaded(loaded),
        "last_event_at": last_event.isoformat() if last_event else None,
        "findings": findings,
    }


def browse_logs(
    source: Any,
    period: str,
    user: str = "",
    solution: str = "",
    how: str = "",
    page: int = 1,
    page_size: int = BROWSE_PAGE,
    now: datetime | None = None,
) -> dict[str, Any]:
    """사용자는 "부서 이름" 완전 일치입니다 (부분 일치면 다른 사람 로그가 섞임). options 는 로그 전체 기준."""
    now = now or datetime.now(timezone.utc)
    since = period_since(period, now)
    loaded = load_events(source)
    matched = search(between(loaded.records, since, now, include_since=True), solution=solution, how=how)
    if user:
        matched = [e for e in matched if user_label(e) == user]
    page = max(page, 1)
    newest = matched[::-1][(page - 1) * page_size:page * page_size]
    return {
        "period": period,
        "since": since.isoformat(timespec="seconds") if since else None,
        "until": now.isoformat(timespec="seconds"),
        "criteria": {k: v for k, v in (("user", user), ("solution", solution), ("how", how)) if v},
        "total": len(matched),
        "page": page,
        "page_size": page_size,
        "facts": summarize(matched),
        "events": [{**e.model_dump(mode="json"), "user": user_label(e)} for e in newest],
        "options": {k: v for k, v in vocabulary(loaded.records).items() if k in ("users", "solutions", "how", "first", "last")},
        "load_issues": [str(i) for i in loaded.issues],
    }


def ask_logs(engine: Engine, source: Any, question: str, now: datetime | None = None) -> dict[str, Any]:
    """숫자는 모델이 아니라 summarize 가 셉니다."""
    started = time.time()
    events = load_events(source).records
    now = now or datetime.now(timezone.utc)
    result: dict[str, Any] = {"question": question, "criteria": {}, "facts": None, "evidence": [], "answer": "", "sources": []}

    def done(error: str | None) -> dict[str, Any]:
        return {**result, "failed": error is not None, "error": error, "elapsed_sec": round(time.time() - started, 1)}

    log_filter, error, _ = attempt(lambda: engine.log_filter_chain().invoke({
        "question": question,
        "vocabulary": json.dumps({k: v for k, v in vocabulary(events).items() if k not in ("first", "last")}, ensure_ascii=False),
        "now": now.isoformat(timespec="seconds"),
    }))
    if log_filter is None:
        result["answer"] = f"질문을 조건으로 바꾸지 못했습니다: {error}"
        return done(error)

    criteria = {k: v.strip() for k, v in log_filter.model_dump().items() if v.strip()}
    try:
        since = parse_datetime(criteria["since"]) if "since" in criteria else None
        until = parse_datetime(criteria["until"]) if "until" in criteria else None
    except ValueError as exc:  # 모델이 시각을 잘못 적으면 기간 없이 찾지 않고 실패로 알립니다.
        result.update(criteria=criteria, answer=f"기간을 읽지 못했습니다: {exc}")
        return done(str(exc))
    fields = ("user", "department", "solution", "where", "how", "keyword")
    matched = search(between(events, since, until, include_since=True), **{k: criteria[k] for k in fields if k in criteria})
    facts = summarize(matched)
    lines = [e.describe() for e in matched[-LOG_LINES:]]
    result.update(criteria=criteria, facts=facts, evidence=lines)

    answer, error, _ = attempt(lambda: engine.log_answer_chain().invoke({
        "question": question,
        "criteria": json.dumps(criteria, ensure_ascii=False) if criteria else "조건 없음 (전체 로그)",
        "facts": json.dumps(facts, ensure_ascii=False),
        "lines": "\n".join(lines) or "해당 로그 없음",
    }))
    result["answer"] = answer.strip() if answer is not None else f"답변 실패: {error}"
    return done(error)


# 기준 문서에는 서버의 지금 상태가 없어 RAG 대신 수집 · 서버 점검 기록을 코드가 고릅니다.

MODULE_HINTS = {"UFW": "방화벽", "SSH": "원격 접속 sshd 설정", "PAM": "로그인 · 비밀번호 인증", "계정 · sudo": "관리자 계정 · sudo 권한"}
SERVER_LINES = 60


def ask_servers(engine: Engine, registry: list[dict[str, Any]],
                fetch: Callable[[list[str], str | None, str | None], tuple[list[dict[str, Any]], dict[str, Any]]],
                question: str, now: datetime | None = None) -> dict[str, Any]:
    """fetch(노드 이름들, since, until) → (노드별 지금 상태, 기간 안 기록). DB 는 Engine 이 읽습니다."""
    started = time.time()
    now = now or datetime.now(timezone.utc)
    result: dict[str, Any] = {"question": question, "criteria": {}, "facts": None, "evidence": [], "answer": "", "sources": []}

    def done(error: str | None) -> dict[str, Any]:
        return {**result, "failed": error is not None, "error": error, "elapsed_sec": round(time.time() - started, 1)}

    vocab = {"노드": [{"이름": n["name"], "호스트": n["host"], "IP": n["ip"]} for n in registry],
             "모듈": [f"{label} ({MODULE_HINTS[label]})" for label in MODULE_HINTS]}
    server_filter, error, _ = attempt(lambda: engine.server_filter_chain().invoke({
        "question": question, "vocabulary": json.dumps(vocab, ensure_ascii=False),
        "now": f"{now.isoformat(timespec='seconds')} (UTC) = {now.astimezone():%Y-%m-%d %H:%M} {now.astimezone().tzname()} (한국 시간)",
    }))
    if server_filter is None:
        result["answer"] = f"질문을 조건으로 바꾸지 못했습니다: {error}"
        return done(error)

    criteria = {k: v.strip() for k, v in server_filter.model_dump().items() if v.strip()}
    try:
        since = parse_datetime(criteria["since"]).isoformat() if "since" in criteria else None
        until = parse_datetime(criteria["until"]).isoformat() if "until" in criteria else None
    except ValueError as exc:  # 모델이 시각을 잘못 적으면 기간 없이 찾지 않고 실패로 알립니다.
        result.update(criteria=criteria, answer=f"기간을 읽지 못했습니다: {exc}")
        return done(str(exc))
    known = {n["name"] for n in registry}
    asked = [x.strip() for x in criteria.get("nodes", "").split(",") if x.strip()]
    # 모르는 노드 이름은 비슷한 노드로 바꾸지 않습니다.
    names = [x for x in asked if x in known] if asked else sorted(known)
    # 모델이 모듈 목록을 통째로 적기도 해서, 하나만 맞으면 그것으로 · 여럿이면 모든 모듈로 봅니다.
    named = [label for label, hint in MODULE_HINTS.items() if label in criteria.get("module", "") or hint in criteria.get("module", "")]
    module = named[0] if len(named) == 1 else "" if named else criteria.get("module", "")
    if "module" in criteria:
        criteria["module"] = module or "모든 모듈"
    current, history = fetch(names, since, until)
    digest = server_digest(current, history, module)
    lines = digest["lines"][-SERVER_LINES:]
    result.update(criteria=criteria, facts=digest["facts"], evidence=lines)

    answer, error, _ = attempt(lambda: engine.server_answer_chain().invoke({
        "question": question,
        "criteria": json.dumps(criteria, ensure_ascii=False) if criteria else "조건 없음 (모든 서버 · 지금 상태와 전체 기록)",
        "state": "\n\n".join(digest["state"]) or "해당 서버 없음",
        "facts": json.dumps(digest["facts"], ensure_ascii=False),
        "lines": "\n".join(lines) or "해당 기록 없음",
    }))
    result["answer"] = answer.strip() if answer is not None else f"답변 실패: {error}"
    return done(error)


BANDS = ((70, "높음"), (40, "보통"))


def band(score: int) -> str:
    """모델이 적은 등급 대신 점수로 정해 둘이 어긋나지 않게 합니다."""
    return next((name for floor, name in BANDS if score >= floor), "낮음")


def predict_suspect(engine: Engine, info: dict[str, Any], person: Person) -> dict[str, Any]:
    """info = People.suspects 의 한 줄."""
    result = _judge(engine.suspect_chain(), builders.suspect(engine.settings, Prompts.SUSPECT, engine.regulations, info, person))
    if not result["failed"]:
        result["level"] = band(result["score"])
    return result
