"""데이터 계층(sentinelai.data)과 엔진(sentinelai.engine)을 잇는 실행 흐름.

data 와 engine 은 서로를 가져오지 않습니다. 둘을 함께 쓰는 흐름은 여기에만 둡니다.
CLI(`python -m sentinelai`)와 웹이 같은 함수를 부릅니다. 여기 함수는 결과 dict 만 돌려주고, 저장은 sentinelai.db.results 가 합니다.

    engine = Engine()
    review = pipeline.review_policies(engine, engine.settings.policies_source, engine.settings.servers_source)  # 문서 · 규칙 적재 포함
    run = pipeline.monitor(engine, engine.settings.events_source, since)   # since 이후 로그만
"""
from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .data import (
    LoadIssue,
    LoadResult,
    PolicyRule,
    between,
    event_review_input,
    group_by_user,
    latest,
    load_events,
    load_policies,
    load_requests,
    load_servers,
    parse_datetime,
    period_since,
    search,
    server_review_input,
    summarize,
    user_label,
    vocabulary,
)
from . import ROOT
from .engine import Engine, IndexReport

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


def index_documents(engine: Engine, source: Any = DOCS_DIR) -> IndexReport:
    """사내 기준 문서를 RAG 에 적재합니다 (바뀐 파일만). 서버 현황 · 정책 검증이 이 조항을 찾습니다."""
    return engine.documents.index(source)


def index_policies(engine: Engine, source: Any) -> tuple[LoadResult, IndexReport]:
    """솔루션 정책 규칙을 RAG 에 적재합니다. 바뀌지 않았으면 건너뜁니다."""
    loaded = load_policies(source)
    if not loaded.records:
        raise ValueError(f"{loaded.source}: 적재할 정책이 없습니다")
    report = engine.documents.index_rules(loaded.source, [r.describe() for r in loaded.records])
    return loaded, report


def review_requests(engine: Engine, source: Any, progress: Progress | None = None) -> dict[str, Any]:
    """CSV 권한 신청 전 건을 review_chain 으로 판정합니다 (평가용 — 기대 등급과 대조할 때. 저장하지 않습니다)."""
    loaded = load_requests(source)
    chain = engine.review_chain()
    reviews = []
    for n, request in enumerate(loaded.records, start=1):
        verdict, error, elapsed = attempt(lambda: chain.invoke(request.review_input()))
        review = {**request.model_dump(), **_judged(verdict, error, elapsed)}
        reviews.append(review)
        if progress:
            progress(n, len(loaded.records), review)
    return {**_loaded(loaded), "reviews": reviews}


def judge_request(engine: Engine, request: dict[str, Any]) -> dict[str, Any]:
    """권한 DB의 신청 1건 → AI 판정 (신청 행의 AI 칸에 저장할 dict). 신청이 들어오면 바로 부릅니다."""
    inputs = {
        "requester": f"{request.get('requester_department', '')} {request['requester_name']}".strip(),
        "requested_access": request["requested_access"],
        "current_access": request.get("current_access", ""),
    }
    verdict, error, elapsed = attempt(lambda: engine.review_chain().invoke(inputs))
    return _judged(verdict, error, elapsed)


def _optional(loader: Callable[[Any], LoadResult], source: Any) -> LoadResult:
    """폴더 · 파일이 없으면 그쪽 검토만 건너뜁니다. 없다는 사실은 읽기 실패로 남겨 화면에 보입니다."""
    try:
        return loader(source)
    except FileNotFoundError as exc:
        return LoadResult(source=Path(str(source)).name, issues=[LoadIssue(0, str(exc))])


def review_policies(engine: Engine, policies_source: Any, servers_source: Any,
                    progress: Progress | None = None) -> dict[str, Any]:
    """정책 관리 검토 1회 → db.results.save_policy_review

    0. 기준 문서(docs/) · 솔루션 정책 규칙을 RAG 에 맞춥니다 (바뀐 것만). 판정이 지금 문서 · 규칙을 찾게 합니다.
    1. 솔루션 정책 규칙 전체 → policy_chain (정책 간 중복 · 충돌 · 과도한 허용)
    2. 서버 현황 한 대씩 → server_chain → ServerReview (기준 문서와 다른 곳마다 지금 · 기준 · 조항 · 바꿀 것)
    한쪽 데이터가 없으면 그쪽은 건너뛰고, 둘 다 없으면 ValueError 를 냅니다.
    """
    policies = _optional(load_policies, policies_source)
    servers = _optional(load_servers, servers_source)
    if not policies.records and not servers.records:
        problems = [str(i) for i in policies.issues + servers.issues]
        raise ValueError("검토할 데이터가 없습니다 — 솔루션 정책 · 서버 현황 폴더에 CSV · JSON 을 두세요"
                         + (f" ({'; '.join(problems)})" if problems else ""))
    index_documents(engine)
    # 정책 폴더가 지금 규칙의 기준입니다. 비었으면 예전 규칙이 서버 점검 · 로그 감시 검색에 섞이지 않게 지웁니다.
    if policies.records:
        engine.documents.index_rules(policies.source, [r.describe() for r in policies.records])
    else:
        engine.documents.clear_rules()
    total = int(bool(policies.records)) + len(servers.records)

    if policies.records:
        text = PolicyRule.format(policies.records)
        review, error, elapsed = attempt(lambda: engine.policy_chain().invoke({"policies": text}))
        rules_part = _judged(review, error, elapsed)
        if progress:
            progress(1, total, rules_part)
    else:
        rules_part = {"summary": "솔루션 정책 규칙이 없어 정책 간 검토는 하지 않았습니다.", "issues": [],
                      "failed": False, "error": None, "elapsed_sec": 0.0}

    findings = []
    chain = engine.server_chain() if servers.records else None
    for n, server in enumerate(servers.records, start=1):
        inputs = server_review_input(server, policies.records)
        review, error, elapsed = attempt(lambda: chain.invoke(inputs))
        # state 는 프롬프트용 글이 아니라 원본 행을 남깁니다 (화면이 컬럼 · 값 표로 보여줍니다).
        finding = {**inputs, "host": server.host, "ip": server.ip, "state": server.raw, **_judged(review, error, elapsed)}
        findings.append(finding)
        if progress:
            progress(n + int(bool(policies.records)), total, finding)

    return {
        **_loaded(policies),
        "rules": [r.model_dump() for r in policies.records],
        **rules_part,
        "servers": {**_loaded(servers), "findings": findings},
    }


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
        # 알림(engine/alert.py 의 Notifier)을 구축하면 주의 · 위험 판정을 여기서 보냅니다.
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
