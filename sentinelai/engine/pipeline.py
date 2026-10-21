"""판정 흐름 — 체인(프롬프트 + 검색 + 모델)과 그것을 데이터에 돌리는 흐름을 한곳에 둡니다.

체인은 LangChain Runnable 을 돌려주는 함수입니다 (engine.review_chain() 처럼 Engine 이 넘겨 줍니다).
흐름은 데이터 계층(sentinelai.data)에서 읽어 체인에 넣고 결과 dict 만 돌려줍니다. 저장 · 큐는 Engine(engine.py)이 합니다.
데이터 계층은 엔진을 모릅니다. 둘을 잇는 일은 여기에만 둡니다.

    정책 이해: review_chain(권한 신청) · policy_chain(정책 모순) · server_chain(서버 점검) · answer_chain · rag_chain(질의응답)
    서버 질의: server_filter_chain · server_answer_chain (수집 · 서버 점검 기록으로 답함)
    로그 감시: event_chain(로그 ↔ 정책) · log_filter_chain · log_answer_chain(로그 질의)
"""
from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable, RunnablePassthrough

from .. import ROOT
from ..data import (
    LoadIssue,
    LoadResult,
    PolicyRule,
    ServerSnapshot,
    ServerState,
    between,
    event_review_input,
    group_by_user,
    latest,
    load_events,
    load_policies,
    load_servers,
    parse_datetime,
    period_since,
    search,
    server_digest,
    server_review_input,
    snapshot_changes,
    snapshot_from_payload,
    summarize,
    user_label,
    vocabulary,
)
from .prompt import Prompts
from .rag import IndexReport, lookup, lookup_all
from .types import Answer, LogFilter, PolicyReview, ServerFilter, ServerReview, Verdict

if TYPE_CHECKING:
    from .engine import Engine


# --- 체인 --------------------------------------------------------------------
# retrieve=False 면 검색하지 않으므로 context(· rules)도 입력으로 직접 넘겨야 합니다. k 는 종류별 검색 건수입니다.


def review_chain(engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """접근 권한 신청 검토 → Verdict. 입력: requester, requested_access, current_access"""
    reviewer = engine.chain(Prompts.ACCESS_REVIEW, Verdict, **kwargs)
    if not retrieve:
        return reviewer
    query = lambda x: f"{x['requester']} / {x['requested_access']}"  # noqa: E731
    return RunnablePassthrough.assign(context=query | lookup(engine, k, "clause")) | reviewer


def policy_chain(engine: Engine, structured: bool = True, retrieve: bool = True, k: int | None = None,
                 **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """솔루션 정책 간 중복 · 충돌 · 과도한 허용 → PolicyReview. 입력: policies (한 줄에 한 건).
    규칙은 입력으로 받으므로 기준 조항만 찾습니다."""
    reviewer = engine.chain(Prompts.POLICY_CONFLICT, PolicyReview if structured else None, **kwargs)
    if not retrieve:
        return reviewer
    return RunnablePassthrough.assign(context=(lambda x: x["policies"]) | lookup(engine, k, "clause")) | reviewer


def server_chain(engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """서버 한 대의 현황 · 모듈 상태와 그 서버에 걸린 규칙을 기준 문서에 비춥니다 → ServerReview(다른 곳 · 바꿀 것).

    입력: subject(서버), state(현황, 한 줄에 한 항목), matched(코드가 IP · 대역 · 호스트 이름으로 찾은 규칙).
    코드가 못 찾은 규칙(표기가 다른 것)은 rules 로 검색해 보탭니다.
    """
    reviewer = engine.chain(Prompts.SERVER_REVIEW, ServerReview, **kwargs)
    if not retrieve:
        return reviewer
    query = lambda x: f"{x['subject']} / {x['state']}"  # noqa: E731
    return RunnablePassthrough.assign(context=query | lookup(engine, k, "clause"), rules=query | lookup(engine, k, "rule")) | reviewer


def event_chain(engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """로그 묶음(한 사용자)을 정책과 비교 → Verdict. 입력: subject(대상 사용자), events(한 줄에 한 건)"""
    reviewer = engine.chain(Prompts.EVENT_REVIEW, Verdict, **kwargs)
    if not retrieve:
        return reviewer
    query = lambda x: f"{x['subject']} / {x['events']}"  # noqa: E731
    return RunnablePassthrough.assign(context=query | lookup(engine, k, "clause"), rules=query | lookup(engine, k, "rule")) | reviewer


# 로그는 RAG 로 찾지 않습니다. "몇 번 · 언제부터 · 누가" 같은 질문은 집계라서, 비슷한 몇 줄만 찾아오면 건수가 틀립니다.
# 모델은 질문을 조건으로 바꾸고(log_filter_chain) 코드가 센 결과로 답을 쓰기만 합니다(log_answer_chain). 둘을 잇는 것은 ask_logs 입니다.


def log_filter_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """질문 → LogFilter. 입력: question, vocabulary(로그에 있는 값), now(현재 시각 UTC)"""
    return engine.chain(Prompts.LOG_FILTER, LogFilter, **{"llm": engine.qa_llm, **kwargs})


def log_answer_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """조건 · 집계 · 로그 → 답변 문자열. 입력: question, criteria, facts, lines"""
    return engine.chain(Prompts.LOG_ANSWER, None, **{"llm": engine.qa_llm, **kwargs})


def server_filter_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """질문 → ServerFilter. 입력: question, vocabulary(등록된 노드 · 모듈), now(현재 시각 UTC)"""
    return engine.chain(Prompts.SERVER_FILTER, ServerFilter, **{"llm": engine.qa_llm, **kwargs})


def server_answer_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """조건 · 노드 상태 · 집계 · 기록 → 답변 문자열. 입력: question, criteria, state, facts, lines"""
    return engine.chain(Prompts.SERVER_ANSWER, None, **{"llm": engine.qa_llm, **kwargs})


def answer_chain(engine: Engine, structured: bool = False, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """근거를 직접 넘기는 질의응답. 입력: context, question"""
    return engine.chain(Prompts.ANSWER, Answer if structured else None, **{"llm": engine.qa_llm, **kwargs})


def rag_chain(engine: Engine, structured: bool = False, k: int | None = None, **kwargs: Any) -> Runnable[str, Any]:
    """저장소에서 근거(조항 · 규칙)를 찾아 답합니다. 입력: 질문 문자열"""
    return {"context": lookup_all(engine, k), "question": RunnablePassthrough()} | answer_chain(engine, structured, **kwargs)


# --- 흐름 --------------------------------------------------------------------

# 사내 기준 문서(정책 문서) 폴더. 정책 관리 검토를 돌릴 때마다 바뀐 파일만 RAG 에 다시 적재합니다.
DOCS_DIR = ROOT / "docs"
RETRIES = 2
# 답변 프롬프트와 화면에 싣는 로그 줄 수. 건수 · 합계는 전체로 세므로 이 수에 묶이지 않습니다.
LOG_LINES = 50
BROWSE_PAGE = 100

Progress = Callable[[int, int, dict[str, Any]], None]


def attempt(call: Callable[[], Any], retries: int = RETRIES) -> tuple[Any | None, str | None, float]:
    """call() 을 최대 retries+1 회 시도합니다. → (결과 또는 None, 마지막 실패 원인, 소요 초)"""
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
    """판정 결과는 엔진 타입 필드를 그대로 두고, 실패 여부와 소요 시간만 덧붙입니다."""
    base = {"failed": verdict is None, "error": error, "elapsed_sec": round(elapsed, 1)}
    return {**verdict.model_dump(), **base} if verdict is not None else base


# --- 정책 이해 --------------------------------------------------------------


def index_documents(engine: Engine, source: Any = DOCS_DIR, rebuild: bool = False) -> IndexReport:
    """사내 기준 문서를 RAG 에 적재합니다 (바뀐 파일만). 서버 현황 · 정책 검증이 이 조항을 찾습니다."""
    return engine.documents.index(source, rebuild=rebuild)


def judge_request(engine: Engine, request: dict[str, Any]) -> dict[str, Any]:
    """권한 DB의 신청 1건 → AI 판정 (신청 행의 AI 칸에 저장할 dict). 신청이 들어오면 바로 부릅니다."""
    inputs = {
        "requester": f"{request.get('requester_department', '')} {request['requester_name']}".strip(),
        "requested_access": _access_text(request),
        "current_access": request.get("current_access") or "없음",
    }
    verdict, error, elapsed = attempt(lambda: engine.review_chain().invoke(inputs))
    return _judged(verdict, error, elapsed)


def _access_text(request: dict[str, Any]) -> str:
    """신청 권한 이름에 권한 목록의 코드 · 시스템 · 분류 · 설명을 붙입니다. 분류(급여정보 등)가 조항 검색과 판정의 실마리가 됩니다."""
    lines = [f"{request['requested_access']} ({request['access_code']})" if request.get("access_code") else request["requested_access"]]
    for label, key in (("시스템", "access_system"), ("분류", "access_category"), ("설명", "access_description")):
        if request.get(key):
            lines.append(f"{label}: {request[key]}")
    return "\n".join(lines)


def _optional(loader: Callable[[Any], LoadResult], source: Any) -> LoadResult:
    """폴더 · 파일이 없으면 그쪽 검토만 건너뜁니다. 없다는 사실은 읽기 실패로 남겨 화면에 보입니다."""
    try:
        return loader(source)
    except FileNotFoundError as exc:
        return LoadResult(source=Path(str(source)).name, issues=[LoadIssue(0, str(exc))])


def review_policies(engine: Engine, policies_source: Any, progress: Progress | None = None) -> dict[str, Any]:
    """정책 관리 검토 1회 (화면의 [정책 관리 검토 실행]) → db.results.save_policy_review

    0. 기준 문서(docs/) · 솔루션 정책 규칙을 RAG 에 맞춥니다 (바뀐 것만). 판정이 지금 문서 · 규칙을 찾게 합니다.
    1. 솔루션 정책 규칙 전체 → policy_chain (정책 간 중복 · 충돌 · 과도한 허용)
    서버 점검은 여기서 하지 않고, 수집 노드가 보낸 것을 check_nodes 가 주기적으로 봅니다.
    정책 폴더가 비었으면 RAG 의 규칙을 지우고 빈 검토를 돌려줍니다 — 예전 규칙이 서버 점검 · 로그 감시 검색에 섞이지 않게 합니다.
    """
    policies = _optional(load_policies, policies_source)
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


# --- 수집 노드 · 서버 점검 -----------------------------------------------------


def snapshot_row(payload: dict[str, Any], node: str, previous: dict[str, Any] | None) -> dict[str, Any]:
    """노드가 보낸 본문 → db.results.save_snapshot 에 넣을 수집 기록. 형식이 틀리면 ValueError.

    previous = db.results.latest_snapshot. 이번 수집이 그보다 늦을 때만 바뀐 것을 셉니다 (늦게 도착한 옛 수집은 앞뒤가 맞지 않음).
    """
    snap = snapshot_from_payload(payload, node)
    at = snap.collected_at.isoformat(timespec="seconds")
    newer = previous is None or at > previous["collected_at"]
    return {**snap.model_dump(mode="json", exclude={"raw"}), "collected_at": at,
            "changes": snapshot_changes(previous and previous["modules"], snap.modules) if newer else []}


def check_nodes(engine: Engine, snapshots: list[dict[str, Any]], policies_source: Any, servers_source: Any,
                progress: Progress | None = None) -> dict[str, Any]:
    """서버 점검 — 새 수집이 온 노드마다 server_chain → ServerReview. → db.results.save_node_finding

    snapshots = db.results.pending_snapshots. 판정 입력은 노드의 모듈 상태 · 직전 수집과 달라진 설정에
    서버 현황 표(호스트 이름 · IP 가 같은 행, 있으면)와 그 서버를 가리키는 솔루션 정책을 더한 것입니다.
    """
    policies = _optional(load_policies, policies_source)
    servers = _optional(load_servers, servers_source)
    inventory = {}
    for row in servers.records:
        inventory[row.host.lower()] = row
        if row.ip:
            inventory[row.ip] = row
    if snapshots:
        index_documents(engine)
    findings = []
    chain = engine.server_chain() if snapshots else None
    for n, snap in enumerate(snapshots, start=1):
        server = inventory.get(snap["host"].lower()) or inventory.get(snap["ip"]) or ServerState(host=snap["host"], ip=snap["ip"])
        snapshot = ServerSnapshot(**{k: snap[k] for k in ("node", "host", "ip", "collected_at", "collected_by", "modules")})
        inputs = server_review_input(server, policies.records, snapshot, snap["changes"])
        review, error, elapsed = attempt(lambda: chain.invoke(inputs))
        finding = {"node": snap["node"], "snapshot_id": snap["id"], "host": snap["host"], "ip": snap["ip"] or server.ip,
                   "state": server.raw, "matched": inputs["matched"], **_judged(review, error, elapsed)}
        findings.append(finding)
        if progress:
            progress(n, len(snapshots), finding)
    return {"findings": findings, "load_issues": [str(i) for i in policies.issues + servers.issues]}


# --- 로그 감시 --------------------------------------------------------------


def monitor(
    engine: Engine,
    source: Any,
    since: datetime | None = None,
    until: datetime | None = None,
    progress: Progress | None = None,
) -> dict[str, Any]:
    """로그 감시 1회 — 읽기 → 시각 필터 → 사용자별 묶기 → event_chain 판정. → db.results.save_monitor_run"""
    loaded = load_events(source, since=since, until=until)
    findings = []
    groups = group_by_user(loaded.records)
    chain = engine.event_chain() if groups else None
    for n, (user, events) in enumerate(groups.items(), start=1):
        inputs = event_review_input(events)
        verdict, error, elapsed = attempt(lambda: chain.invoke(inputs))
        last = latest(events)
        finding = {
            # 같은 사용자가 다음 실행에도 나올 수 있어 마지막 로그 시각을 붙여 구분합니다.
            "id": f"{user}@{last.isoformat()}",
            "user": user,
            "first_event_at": events[0].occurred_at.isoformat(),
            "last_event_at": last.isoformat(),
            **inputs,
            **_judged(verdict, error, elapsed),
        }
        findings.append(finding)
        # 알림(types.py 의 Notifier)을 구축하면 주의 · 위험 판정을 여기서 보냅니다.
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
    """로그 조회 — 지금부터 period(PERIODS) 안의 로그를 사용자 · 솔루션 · 행위로 고르고 셉니다.

    거르기만 하므로 모델을 부르지 않습니다. 사용자는 화면이 고른 "부서 이름"과 같아야 합니다
    (부분 일치면 다른 사람의 로그가 섞일 수 있습니다). 최신 로그부터 page_size 건씩 돌려줍니다.
    options 는 거르기 칸에 띄울 값입니다. 고른 조건과 상관없이 로그 전체에서 뽑아 칸이 줄어들지 않게 합니다.
    """
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
    """로그 질의 — 질문 → 조건(모델) → 찾고 세기(코드) → 답변(모델).

    숫자는 모델이 세지 않고 summarize 가 셉니다. 근거 로그(evidence)도 코드가 고른 그대로 돌려줍니다.
    """
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


# --- 서버 질의 ------------------------------------------------------------------
# 서버 상태는 RAG 로 찾지 않습니다 (기준 문서에는 서버의 지금 상태가 없습니다). 로그 질의처럼 모델이 조건을 뽑고,
# 코드가 수집 · 서버 점검 기록을 골라 세고(server_digest), 모델은 그 결과로 답만 씁니다.

MODULE_HINTS = {"UFW": "방화벽", "SSH": "원격 접속 sshd 설정", "PAM": "로그인 · 비밀번호 인증", "계정 · sudo": "관리자 계정 · sudo 권한"}
SERVER_LINES = 60


def ask_servers(engine: Engine, registry: list[dict[str, Any]],
                fetch: Callable[[list[str], str | None, str | None], tuple[list[dict[str, Any]], dict[str, Any]]],
                question: str, now: datetime | None = None) -> dict[str, Any]:
    """서버 질의 — 질문 → 조건(모델) → 고르고 세기(코드) → 답변(모델).

    registry = 등록된 노드(db.nodes.list_nodes), fetch(노드 이름들, since, until) → (노드별 지금 상태, 기간 안 기록).
    DB 는 Engine 이 읽어 fetch 로 넘깁니다 (pipeline 은 저장소를 모릅니다).
    """
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
    # 모르는 노드 이름은 비슷한 노드로 바꾸지 않습니다. 그 이름만 물었으면 고른 노드가 없어 "없다"고 답하게 됩니다.
    names = [x for x in asked if x in known] if asked else sorted(known)
    # 모델이 모듈 설명까지 옮겨 적거나 목록을 통째로 적기도 합니다. 모듈 이름이 하나만 들어 있으면 그것으로, 여럿이면 모든 모듈로 봅니다.
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
