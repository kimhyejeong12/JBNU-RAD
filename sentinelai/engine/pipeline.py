"""판정 흐름 — 체인(프롬프트 + 검색 + 모델)과 데이터를 체인에 돌려 결과 dict 를 내는 흐름."""
from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable, RunnablePassthrough

from .. import ROOT
from ..sources import (
    LoadResult,
    PolicyRule,
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
    rules_for,
    search,
    server_digest,
    signals_text,
    snapshot_changes,
    snapshot_from_payload,
    summarize,
    user_label,
    vocabulary,
)
from ..sources.logs import SecurityEvent
from .prompt import Prompts
from .rag import IndexReport, lookup, lookup_all
from .types import Answer, LogFilter, PolicyReview, ServerFilter, ServerReview, SuspectScore, Verdict

if TYPE_CHECKING:
    from .engine import Engine


# retrieve=False 면 검색하지 않으므로 context(· rules)를 입력으로 넘겨야 합니다.


def review_chain(engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: requester, requested_access, current_access"""
    reviewer = engine.chain(Prompts.ACCESS_REVIEW, Verdict, **kwargs)
    if not retrieve:
        return reviewer
    query = lambda x: f"{x['requester']} / {x['requested_access']}"  # noqa: E731
    return RunnablePassthrough.assign(context=query | lookup(engine, k, "clause")) | reviewer


def grant_chain(engine: Engine, k: int | None = None, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """이동한 사람의 보유 권한 재검토. 입력: requester, move, requested_access, reason, period"""
    reviewer = engine.chain(Prompts.GRANT_REVIEW, Verdict, **kwargs)
    query = lambda x: f"{x['requester']} / {x['requested_access']}"  # noqa: E731
    return RunnablePassthrough.assign(context=query | lookup(engine, k, "clause")) | reviewer


def policy_chain(engine: Engine, structured: bool = True, retrieve: bool = True, k: int | None = None,
                 **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: policies (한 줄에 한 건). 규칙은 입력으로 받으므로 조항만 찾습니다."""
    reviewer = engine.chain(Prompts.POLICY_CONFLICT, PolicyReview if structured else None, **kwargs)
    if not retrieve:
        return reviewer
    return RunnablePassthrough.assign(context=(lambda x: x["policies"]) | lookup(engine, k, "clause")) | reviewer


def server_chain(engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: subject, state, matched(코드가 찾은 규칙). 코드가 못 찾은 규칙은 검색해 보탭니다."""
    reviewer = engine.chain(Prompts.SERVER_REVIEW, ServerReview, **kwargs)
    if not retrieve:
        return reviewer
    query = lambda x: f"{x['subject']} / {x['state']}"  # noqa: E731
    return RunnablePassthrough.assign(context=query | lookup(engine, k, "clause"), rules=query | lookup(engine, k, "rule")) | reviewer


def event_chain(engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: subject(대상 사용자), events(한 줄에 한 건)"""
    reviewer = engine.chain(Prompts.EVENT_REVIEW, Verdict, **kwargs)
    if not retrieve:
        return reviewer
    query = lambda x: f"{x['subject']} / {x['events']}"  # noqa: E731
    return RunnablePassthrough.assign(context=query | lookup(engine, k, "clause"), rules=query | lookup(engine, k, "rule")) | reviewer


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


def suspect_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """입력: subject, signals, records, lines"""
    return engine.chain(Prompts.SUSPECT, SuspectScore, **kwargs)


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


RECORD_REQUESTS = 10
NO_RECORD = "기록 없음"
FAST_RECORD = "빠른 감시라 넣지 않음 — 이 로그만으로 판단"


def judge_request(engine: Engine, request: dict[str, Any], history: str = NO_RECORD, threats: str = NO_RECORD) -> dict[str, Any]:
    """신청 1건 → 신청 행의 AI 칸에 저장할 dict."""
    lines = [f"{request.get('requester_department', '')} {request['requester_name']}".strip(),
             f"직무: {request.get('requester_job') or '적지 않음'}"]
    if request.get("move"):
        lines.append(f"최근 이동: {_move_text(request['move'])}")
    inputs = {
        "requester": "\n".join(lines),
        "requested_access": _access_text(request),
        "reason": (request.get("reason") or "").strip() or "적지 않음",
        "period": _period_text(request),
        "current_access": request.get("current_access") or "없음",
        "history": history, "threats": threats,
    }
    verdict, error, elapsed = attempt(lambda: engine.review_chain().invoke(inputs))
    return _judged(verdict, error, elapsed)


def judge_grant(engine: Engine, grant: dict[str, Any], history: str = NO_RECORD, threats: str = NO_RECORD) -> dict[str, Any]:
    """grant 는 신청 행 + move. → grant_reviews 에 쌓을 dict"""
    move = grant["move"]
    inputs = {
        "requester": f"{move['to_department']} {grant['requester_name']}\n직무: {move['to_job'] or '적지 않음'}".strip(),
        "move": _move_text(move),
        "requested_access": _access_text(grant),
        "reason": (grant.get("reason") or "").strip() or "적지 않음",
        "period": _period_text(grant),
        "history": history, "threats": threats,
    }
    verdict, error, elapsed = attempt(lambda: engine.grant_chain().invoke(inputs))
    return _judged(verdict, error, elapsed)


def _move_text(move: dict[str, Any]) -> str:
    side = lambda d, j: f"{d or '부서 없음'}({j or '직무 없음'})"  # noqa: E731
    return f"{move['moved_on']} {side(move['from_department'], move['from_job'])} → {side(move['to_department'], move['to_job'])}"


def _period_text(request: dict[str, Any]) -> str:
    start, end = request.get("period_start") or "", request.get("period_end") or ""
    return f"{start or '신청일'}부터 {end + '까지' if end else '끝을 정하지 않음'}"


def _access_text(request: dict[str, Any]) -> str:
    """분류(급여정보 등)가 조항 검색과 판정의 실마리라 권한 목록 정보를 붙입니다."""
    lines = [f"{request['requested_access']} ({request['access_code']})" if request.get("access_code") else request["requested_access"]]
    for label, key in (("시스템", "access_system"), ("분류", "access_category"), ("설명", "access_description")):
        if request.get(key):
            lines.append(f"{label}: {request[key]}")
    return "\n".join(lines)


def review_policies(engine: Engine, policies_source: Any, progress: Progress | None = None) -> dict[str, Any]:
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
    review, error, elapsed = attempt(lambda: engine.policy_chain().invoke({"policies": PolicyRule.format(policies.records)}))
    rules_part = _judged(review, error, elapsed)
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
                progress: Progress | None = None) -> dict[str, Any]:
    """새 수집이 온 노드마다 server_chain 으로 판정합니다."""
    policies = optional(load_policies, policies_source)
    servers = optional(load_servers, servers_source)
    found = inventory(servers.records)
    if snapshots:
        index_documents(engine)
    findings = []
    chain = engine.server_chain() if snapshots else None
    for n, snap in enumerate(snapshots, start=1):
        server = found.get(snap["host"].lower()) or found.get(snap["ip"]) or ServerState(host=snap["host"], ip=snap["ip"])
        snapshot = ServerSnapshot(**{k: snap[k] for k in ("node", "host", "ip", "collected_at", "collected_by", "modules")})
        inputs = server_review_input(server, policies.records, snapshot, snap["changes"])
        review, error, elapsed = attempt(lambda: chain.invoke(inputs))
        finding = {"node": snap["node"], "snapshot_id": snap["id"], "host": snap["host"], "ip": snap["ip"] or server.ip,
                   "state": server.raw, "matched": inputs["matched"], **_judged(review, error, elapsed)}
        findings.append(finding)
        if progress:
            progress(n, len(snapshots), finding)
    return {"findings": findings, "load_issues": [str(i) for i in policies.issues + servers.issues]}


def monitor(
    engine: Engine,
    source: Any,
    since: datetime | None = None,
    until: datetime | None = None,
    progress: Progress | None = None,
    fast: bool = False,
    history: Callable[[str], tuple[str, str]] | None = None,
) -> dict[str, Any]:
    """history 는 정밀 감시만 넘깁니다 — 빠른 감시는 수 초 안에 끝나야 해서 로그만 봅니다."""
    loaded = load_events(source, since=since, until=until)
    findings = []
    groups = group_by_user(loaded.records)
    chain = (engine.event_chain(llm=engine.fast_llm) if fast else engine.event_chain()) if groups else None
    for n, (user, events) in enumerate(groups.items(), start=1):
        inputs = event_review_input(events)
        record, threats = history(user) if history else (FAST_RECORD, FAST_RECORD)
        verdict, error, elapsed = attempt(lambda: chain.invoke({**inputs, "history": record, "threats": threats}))
        last = latest(events)
        finding = {
            # 같은 사용자가 다음 실행에도 나올 수 있어 마지막 로그 시각을 붙입니다.
            "id": f"{user}@{last.isoformat()}",
            "user": user,
            "first_event_at": events[0].occurred_at.isoformat(),
            "last_event_at": last.isoformat(),
            **inputs,
            **_judged(verdict, error, elapsed),
        }
        findings.append(finding)
        # 알림(Notifier)을 붙이면 여기서 보냅니다.
        if progress:
            progress(n, len(groups), finding)
    last_event = latest(loaded.records)
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


# 예전 AI 등급은 넣지 않습니다 — 한 번 위험으로 찍힌 사람이 계속 위험으로 나오지 않게.



def user_record_text(account: dict[str, Any] | None, log_id: str, facts: dict[str, Any] | None,
                     signals: dict[str, Any] | None, include_signals: bool = True) -> str:
    rows: list[str] = []
    if account:
        rows.append(f"- 계정: {account['department'] or '부서 없음'} · 직무 {account['job'] or '적지 않음'} · "
                    f"{'정지' if not account['is_active'] else '활성'} · 만든 날 {account['created_at'][:10]}"
                    + (f" · 퇴사일 {account['left_on']}" if account["left_on"] else ""))
        rows += [f"- 이동: {_move_text(m)}" for m in account["moves"][-5:]]
        rows.append("- 지금 가진 권한: " + (", ".join(f"{h['requested_access']}({h['period_end'] or '기간 없음'}까지)" for h in account["held"]) or "없음"))
        reqs = account["requests"]
        if reqs:
            counts = {k: sum(r["stage"] == k for r in reqs) for k in ("승인", "반려", "회수", "철회")}
            rows.append(f"- 권한 신청 {len(reqs)}건 (" + ", ".join(f"{k} {v}" for k, v in counts.items() if v) + ")")
            for r in reqs[:RECORD_REQUESTS]:
                line = f"  - {r['at'][:10]} {r['access']} — {r['stage']}"
                if r["rejected_by"]:
                    line += f" ({r['rejected_by']} 반려: {(r['comment'] or '의견 없음')[:80]})"
                if r["revoke_reason"]:
                    line += f" (회수 사유: {r['revoke_reason'][:80]})"
                rows.append(line + f" · 사유: {(r['reason'] or '없음')[:60]}")
        else:
            rows.append("- 권한 신청 없음")
    else:
        rows.append("- SentinelAI 계정과 잇지 않은 로그 사용자 — 계정 기록 없음 (의심 근거 아님)")
    if facts and facts["count"]:
        top = lambda d: ", ".join(f"{k} {v}" for k, v in list(d.items())[:3])  # noqa: E731
        rows.append(f"- 로그 {facts['count']}건 ({facts['first'][:10]} ~ {facts['last'][:10]}) · 솔루션 {top(facts['by_solution'])} · 행위 {top(facts['by_how'])}")
    elif log_id:
        rows.append("- 로그 없음")
    else:
        rows.append("- 로그 사용자 ID 를 아직 적지 않아 로그를 잇지 못함 (의심 근거 아님)")
    if include_signals and signals:
        rows.append("- 행동 신호 (최근 7일 vs 앞 4주):\n" + "\n".join("  " + x for x in signals_text(signals).splitlines()))
    return "\n".join(rows)


def predict_suspect(engine: Engine, person: dict[str, Any], record: str, threats: str) -> dict[str, Any]:
    """person = data.suspect_people 의 한 줄."""
    who = f"{person['department']} {person['name']}".strip()
    # 계정 미연결은 운영 설정일 뿐이라 모델이 의심 근거로 삼지 않게 적습니다.
    account = person["login_id"] or "SentinelAI 계정과 아직 잇지 않음 — 의심 근거 아님"
    log_id = person["log_id"] or "로그 사용자 ID 를 아직 적지 않음 — 의심 근거 아님"
    inputs = {"subject": f"{who} (계정: {account} / 로그 사용자 ID: {log_id})",
              "signals": signals_text(person["signals"]), "records": record, "lines": threats}
    verdict, error, elapsed = attempt(lambda: engine.suspect_chain().invoke(inputs))
    result = _judged(verdict, error, elapsed)
    if verdict is not None:
        result["level"] = band(verdict.score)
    return result


def event_review_input(events: list[SecurityEvent]) -> dict[str, str]:
    first = events[0]
    return {
        "subject": f"{first.department} {first.who or first.user_name}".strip(),
        "events": "\n".join(e.describe() for e in events),
    }


def server_review_input(server: ServerState, rules: list[PolicyRule], snapshot: ServerSnapshot | None = None,
                        changes: list[str] | None = None) -> dict[str, str]:
    """subject · state(현황 + 모듈 상태 + 바뀐 설정) · matched(코드가 찾은 규칙)."""
    matched = rules_for(server, rules)
    state = [server.describe()]
    if snapshot:
        state.append(snapshot.describe())
    if changes:
        state.append("- 직전 수집과 달라진 설정:\n" + "\n".join(f"  - {c}" for c in changes))
    return {
        "subject": server.name,
        "state": "\n".join(state),
        "matched": "\n".join(f"{rule.describe()} (이 서버: {why})" for rule, why in matched) or "코드가 찾은 규칙 없음",
    }


BANDS = ((70, "높음"), (40, "보통"))


def band(score: int) -> str:
    """모델이 적은 등급 대신 점수로 정해 둘이 어긋나지 않게 합니다."""
    return next((name for floor, name in BANDS if score >= floor), "낮음")


def suspect_people(accounts: list[dict[str, Any]], signals: dict[str, dict[str, Any]], findings: list[dict[str, Any]],
                   requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """계정과 로그 사용자는 log_id 로 잇고, 잇지 못한 로그 사용자는 "계정 미연결"로 둡니다."""
    people: dict[str, dict[str, Any]] = {}
    by_log: dict[str, str] = {}
    by_account: dict[int, str] = {}

    def person(key: str, **info: Any) -> dict[str, Any]:
        return people.setdefault(key, {"key": key, **info, "signals": None, "findings": [], "requests": []})

    # 일반 사용자와 로그 사용자 ID 를 적은 계정만 사람으로 둡니다.
    for a in accounts:
        if a["role"] != "user" and not a["log_id"]:
            continue
        key = f"account:{a['id']}"
        person(key, name=a["display_name"], department=a["department"], login_id=a["login_id"], log_id=a["log_id"], linked=bool(a["log_id"]))
        by_account[a["id"]] = key
        if a["log_id"]:
            by_log[a["log_id"]] = key
    for log_id, s in signals.items():
        key = by_log.get(log_id) or f"log:{log_id}"
        person(key, name=s["subject"], department="", login_id=None, log_id=log_id, linked=False)["signals"] = s
    for f in findings:
        key = by_log.get(f["log_id"]) or f"log:{f['log_id']}"
        person(key, name=f["subject"], department="", login_id=None, log_id=f["log_id"], linked=False)["findings"].append(f)
    for r in requests:
        if r["account_id"] in by_account:
            people[by_account[r["account_id"]]]["requests"].append(r)
    return list(people.values())
