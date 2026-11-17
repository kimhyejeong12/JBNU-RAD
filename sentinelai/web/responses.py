"""API 가 돌려주는 모양 — 여기 적은 것이 API 명세(/openapi.json)에 나오고, 화면 타입(frontend/src/shared/api/schema.ts)은 거기서 만듭니다.

라우트에 붙이는 방법은 둘입니다.
- response_model: 권한 DB 의 행을 그대로 돌려주는 API. FastAPI 가 응답을 이 모양으로 맞추므로 적지 않은 칸은 응답에서 빠집니다.
- responses 의 model: 판정 · 집계 · 큐처럼 엔진과 데이터 계층이 조립한 값을 돌려주는 API. 명세에만 올리고 응답은 건드리지 않아,
  적은 것이 틀려도 API 는 그대로 나갑니다. 맞는지는 tests/test_api_contract.py 가 실제 값으로 봅니다.

판정 결과는 엔진의 출력 타입(engine/worker.py)을 물려받아 저장하며 붙는 칸만 더합니다.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

from sentinelai.engine import worker as judged

Role = Literal["user", "manager", "top"]
Level = judged.RiskLevel
Stage = Literal["manager", "top", "approved", "rejected", "withdrawn", "revoked"]
DecisionKind = Literal["policy", "event", "server", "suspect"]
OverviewArea = Literal["policy", "server", "event", "suspect", "grant"]


class Ok(BaseModel):
    """돌려줄 내용 없이 끝난 일."""

    ok: bool


class Named(BaseModel):
    """지운 기준 문서의 이름."""

    name: str


# --- 계정 ---


class Me(BaseModel):
    """로그인한 사람 · 계정을 만들거나 고친 결과."""

    id: int
    login_id: str
    display_name: str
    department: str
    role: Role
    is_root: bool
    must_change_password: bool


class UserRow(Me):
    """계정 목록의 한 줄."""

    is_active: bool
    locked_until: str | None
    last_login_at: str | None
    created_at: str
    log_id: str
    job: str
    left_on: str
    email: str


# --- 권한 목록 · 기준 문서 · 변경 이력 ---


class AccessItem(BaseModel):
    """권한 목록의 한 건."""

    id: int
    code: str
    name: str
    system: str
    category: str
    description: str
    is_active: bool
    created_by: int
    created_at: str
    updated_at: str


class Regulation(BaseModel):
    """기준 문서 한 개 — 원문과 고친 시각."""

    name: str
    content: str
    updated_at: str


class RegulationIndex(BaseModel):
    """문서마다 RAG 에 쌓인 조각 수 — 벡터 DB 에 닿지 않거나 비었으면 빈 칸입니다."""

    chunks: dict[str, int]


class ExtractedPdf(BaseModel):
    """PDF 에서 꺼낸 글 — 저장하지 않고 사람이 보고 고친 뒤 올립니다."""

    text: str
    pages: int
    empty_pages: list[int]


class XlsxRow(BaseModel):
    cells: list[str]
    notes: list[str]


class XlsxTable(BaseModel):
    """엑셀의 표 하나 — personal 은 사람 기록(사번 · 이름)이 든 표라 화면이 처음부터 빼 둡니다."""

    sheet: str
    title: str
    intro: list[str]
    columns: list[str]
    rows: list[XlsxRow]
    personal: bool


class ExtractedTables(BaseModel):
    tables: list[XlsxTable]


#: 변경 이력을 보이는 대상 — 화면의 AuditTarget 과 같게 둡니다.
AuditTarget = Literal["regulation", "user", "access"]


class AuditRow(BaseModel):
    """변경 이력의 한 줄 — detail 은 기록마다 칸이 다릅니다 (사유 또는 바뀐 칸과 값)."""

    id: int
    at: str
    action: str
    by: str
    detail: dict[str, Any]


# --- 확인할 사람 · 권한 변동 ---


class WatchFlag(BaseModel):
    """확인할 사람에게 걸린 일 하나 — 퇴사 · 이동 · 보유 권한 · 결재 중 신청."""

    kind: Literal["leave", "move", "grant", "request"]
    level: Level
    at: str
    text: str
    request_no: str | None = None


class WatchPerson(BaseModel):
    """확인할 사람 한 명 — level · at 은 걸린 일 중 가장 높은 등급 · 가장 늦은 날."""

    id: int
    login_id: str
    name: str
    department: str
    job: str
    is_active: bool
    left_on: str
    level: Level
    at: str
    flags: list[WatchFlag]


class RiskFlag(BaseModel):
    """권한 변동에 걸린 일 하나 — 이동 · 보유 권한 · 만료 미회수 · 이동 뒤 로그 감시 판정."""

    kind: Literal["move", "grant", "expired", "event"]
    level: Level
    at: str
    text: str
    request_no: str | None = None
    event_key: str | None = None


class RiskPerson(BaseModel):
    """권한이 달라진 사람 한 명 — log_id · log_user 는 로그 조회로 넘어갈 때 씁니다."""

    id: int
    login_id: str
    name: str
    department: str
    job: str
    is_active: bool
    left_on: str
    level: Level
    at: str
    flags: list[RiskFlag]
    log_id: str
    log_user: str


class RiskPeople(BaseModel):
    """권한 변동 — 부서 · 직무를 옮겼거나 사용 기간이 끝난 권한이 남은 사람."""

    generated_at: str
    people: list[RiskPerson]
    log_error: str | None


# --- 운영자 결정 ---


class DecisionRecord(BaseModel):
    """운영자 결정 한 건 (권한 DB 의 결정 기록 한 줄)."""

    id: int
    kind: DecisionKind
    item_key: str
    subject: str
    action: str
    comment: str
    ai_level: Level | None
    decider_id: int
    decider_name: str
    decider_department: str
    decided_at: str


class DecisionResult(BaseModel):
    """결정을 적은 결과 — decision 은 지금 결정이고 취소면 null."""

    kind: str
    item_key: str
    decision: DecisionRecord | None


class Decision(DecisionRecord):
    """한 판정의 지금 결정 — 결과가 같은 지난 판정에서 이어받았으면 carried_from 에 그 판정의 key."""

    carried_from: str | None = None


# --- 수집 노드 ---


class Node(BaseModel):
    """수집 노드 한 대 — 키 자체는 빼고 발급 여부만."""

    name: str
    host: str
    ip: str
    agent_version: str
    interval_min: int
    registered_at: str
    last_seen_at: str | None
    last_collected_at: str | None
    enabled: bool
    key_issued: bool


class NodeWithKey(Node):
    """등록하거나 키를 다시 발급한 결과."""

    key: str


class NodeRow(Node):
    """노드 목록의 한 줄 — stale 은 간격의 세 배 넘게 소식 없음, level 은 마지막 서버 점검 등급."""

    stale: bool
    level: Level | None
    finding_failed: bool


class Snapshot(BaseModel):
    """수집 한 번 — modules 는 모듈 → 항목 → 값, changes 는 직전 수집과 달라진 설정."""

    id: int
    node: str
    host: str
    ip: str
    collected_at: str
    collected_by: str
    modules: dict[str, dict[str, str]]
    changes: list[str]


class SnapshotBrief(BaseModel):
    """최근 수집 목록의 한 줄."""

    id: int
    collected_at: str
    changes: list[str]


class NodeFindingBrief(BaseModel):
    """한 노드의 지난 서버 점검 한 건."""

    key: str
    snapshot_id: int
    level: Level | None
    failed: bool
    summary: str
    created_at: str


class NodeDetail(Node):
    """노드 하나 — 키 · 최근 수집 · 판정 기록. 해시만 남은 예전 키는 key 가 null 입니다."""

    stale: bool
    key: str | None
    latest: Snapshot | None
    snapshots: list[SnapshotBrief]
    findings: list[NodeFindingBrief]


class SnapshotReceipt(BaseModel):
    """수집을 받은 결과 — 같은 노드 · 수집 시각이 이미 있으면 stored 가 false."""

    node: str
    stored: bool


# --- 권한 신청 ---


class Verdict(judged.Verdict):
    """저장된 AI 판정 — 판정에 실패했으면 failed 가 true 이고 level 이 없습니다."""

    level: Level | None
    failed: bool
    error: str | None
    model: str | None
    elapsed_sec: float | None
    judged_at: str | None
    grounding: dict[str, Any]


class GrantVerdict(Verdict):
    """보유 권한 재검토의 판정 — by 가 code 면 퇴사라 코드가 정한 것이고 근거 확인(grounding)이 없습니다."""

    grounding: dict[str, Any] | None = None
    by: Literal["code", "ai"]


class Approval(BaseModel):
    """결재 한 단계 — ai_level 은 결재자가 본 AI 등급이고 일반 사용자에게는 주지 않습니다."""

    step: Literal["manager", "top"]
    action: Literal["approve", "reject"]
    comment: str
    approver_id: int
    approver_name: str
    approver_department: str | None
    decided_at: str
    ai_level: Level | None = None


class Revocation(BaseModel):
    """권한 회수 기록."""

    reason: str
    revoker_id: int
    revoker_name: str
    revoker_department: str | None
    revoked_at: str


class UserMove(BaseModel):
    """부서 · 직무 이동 한 번."""

    id: int
    from_department: str
    from_job: str
    to_department: str
    to_job: str
    moved_on: str


class GrantReview(BaseModel):
    """받은 뒤 재검토 — 퇴사(leave)면 left_on, 이동(move)이면 move 가 오고 판정 전이면 verdict 가 null 입니다."""

    cause: Literal["leave", "move"]
    left_on: str | None = None
    move: UserMove | None = None
    verdict: GrantVerdict | None
    judging: bool | None = None


class RequestRow(BaseModel):
    """권한 신청 한 건 — ai_verdict · grant_review · judging 은 일반 사용자에게 주지 않습니다."""

    id: int
    request_no: str
    requester_id: int
    requester_name: str
    requester_department: str
    requester_job: str
    requested_access: str
    access_code: str | None
    current_access: str
    reason: str
    period_start: str
    period_end: str
    stage: Stage
    submitted_at: str
    closed_at: str | None
    ai_verdict: Verdict | None = None
    approvals: list[Approval]
    grant_review: GrantReview | None = None
    revocation: Revocation | None
    judging: bool | None = None


class Rejudging(BaseModel):
    """다시 판정을 큐에 넣은 결과."""

    request_no: str
    judging: bool


# --- 검토 결과 (정책 관리 · 서버 점검 · 로그 감시) ---


class Summary(BaseModel):
    """세 구역을 합친 건수 — 판정 실패는 주의로 셉니다."""

    total: int
    정상: int
    주의: int
    위험: int
    policy_issue_count: int
    server_count: int
    event_count: int
    failed: int


class Section(BaseModel):
    """구역 하나의 마지막 실행 — load_issues 는 읽지 못한 로그 파일."""

    generated_at: str
    source: str
    load_issues: list[str]


class PolicyIssue(judged.PolicyIssue):
    """정책 관리 검토가 찾은 문제 한 건."""

    key: str
    seq: int


class PolicyReview(BaseModel):
    """마지막 정책 관리 검토 — 판정에 실패했으면 summary 에 원인이 오고 issues 가 빕니다."""

    summary: str
    issues: list[PolicyIssue]
    elapsed_sec: float | None


class SnapshotState(BaseModel):
    """판정할 때 본 수집 — 수집을 찾지 못하면 빈 객체입니다."""

    collected_at: str | None = None
    collected_by: str | None = None
    modules: dict[str, dict[str, str]] | None = None
    changes: list[str] | None = None


class ServerDetail(BaseModel):
    snapshot: SnapshotState


class ServerFinding(judged.Verdict):
    """노드 한 대의 마지막 서버 점검 — 판정 실패는 level 이 주의이고 reason 에 원인이 옵니다. gaps 에서 정상 항목은 뺍니다."""

    id: str
    key: str
    title: str
    detail: ServerDetail
    gaps: list[judged.ServerGap]
    unjudged: list[str]
    elapsed_sec: float | None
    failed: bool


class EventDetail(BaseModel):
    """판정한 로그 묶음 — events 는 한 줄에 로그 하나."""

    events: str
    first_event_at: str
    last_event_at: str


class EventFinding(judged.Verdict):
    """로그 감시 판정 한 건(주의 이상만) — stage 가 fast 면 아직 확정 전인 1차 판정입니다."""

    id: str
    key: str
    title: str
    detail: EventDetail
    elapsed_sec: float | None
    failed: bool
    stage: Literal["fast", "final"]


class Results(BaseModel):
    """검토 결과 — decisions 는 종류 → 판정 key → 지금 결정, decision_log(결정 기록 전부)는 보안 총책임자에게만 줍니다."""

    generated_at: str | None
    summary: Summary
    sections: dict[str, Section | None]
    policy_review: PolicyReview | None
    servers: list[ServerFinding]
    events: list[EventFinding]
    event_levels: LevelCounts   # 로그 감시 판정 등급별 수 — 목록(events)은 주의 이상만
    decisions: dict[str, dict[str, Decision]]
    decision_log: dict[str, dict[str, list[DecisionRecord]]] | None = None


# --- 작업 큐 ---


class LastRun(BaseModel):
    """한 종류의 마지막 실행 — error 가 있으면 실패했거나 강제로 끝낸 것."""

    finished_at: str
    error: str | None
    auto: bool


class QueueUnit(BaseModel):
    """기다리거나 도는 작업 하나 — 묶음이면 done · total 이 진행입니다."""

    id: int
    kind: str
    key: str
    status: str
    auto: bool
    done: int
    total: int
    created_at: str
    started_at: str | None


class FastJobs(BaseModel):
    """빠른 로그 감시의 상태와 예약."""

    running: str | None
    auto: bool
    done: int
    total: int
    started_at: str | None
    last: dict[str, LastRun]
    every_min: int
    next_at: str


class Jobs(BaseModel):
    """작업 막대 — running 은 도는 작업이고, 없는데 기다리는 작업이 있으면 그 첫 작업(queued). fast 는 빠른 감시를 켰을 때만 옵니다."""

    running: str | None
    auto: bool
    done: int
    total: int
    started_at: str | None
    queued: bool
    last: dict[str, LastRun]
    waiting: list[QueueUnit]
    fast: FastJobs | None = None
    kinds: dict[str, str]


class Schedule(BaseModel):
    every_min: int
    next_at: str


class VerdictQueue(BaseModel):
    """권한 신청 · 보유 권한 재검토 판정의 대기열 — 엔진이 뜨기 전에는 빈 객체입니다."""

    current: str | None = None
    waiting: list[str] | None = None


class QueueStatus(BaseModel):
    """작업 큐 · 자동 실행 예약 · 판정 대기열."""

    jobs: Jobs
    schedule: dict[str, Schedule]
    verdicts: VerdictQueue


class QueueJob(QueueUnit):
    """큐 화면의 잡 한 줄 — close 는 묶음을 닫는 잡, batch 는 속한 묶음의 id."""

    lane: int
    close: bool
    batch: int | None


class QueueLane(BaseModel):
    lane: int
    name: str
    jobs: list[QueueJob]


class QueueDetail(QueueStatus):
    """큐 화면 — 도는 잡 · 길마다 기다리는 잡 · 열린 묶음 · 종류마다 마지막 실행."""

    generation: int
    current: QueueJob | None
    lanes: list[QueueLane]
    batches: list[QueueUnit]
    last: dict[str, LastRun]
    labels: dict[str, str]


class Health(BaseModel):
    """AI 엔진 상태 — 모두 준비되면 ok."""

    base_url: str
    model: str
    qa_model: str
    embedding_model: str
    connected: bool
    model_ready: bool
    qa_model_ready: bool
    embedding_ready: bool
    error: str | None
    index_ready: bool
    ok: bool


# --- 보안 현황: 시스템 ---


class LevelCounts(BaseModel):
    정상: int
    주의: int
    위험: int


class ThreatCounts(BaseModel):
    주의: int
    위험: int


class ThreatDay(BaseModel):
    """하루의 주의 · 위험 수."""

    day: str
    주의: int
    위험: int


class LogTotals(BaseModel):
    """기간 안 로그 수 — 로그를 읽지 못하면 count 가 null 이고 error 에 원인이 옵니다."""

    count: int | None
    days: dict[str, int]
    error: str | None = None


class SafetyItem(BaseModel):
    node: str
    level: Level | None
    stale: bool


class SafetyDay(BaseModel):
    day: str
    score: int


class SafetyScore(BaseModel):
    """안전 점수 — items(노드마다 마지막 등급)는 시스템 안전 점수에만 옵니다."""

    score: int | None
    items: list[SafetyItem] | None = None
    trend: list[SafetyDay]


class EventStats(BaseModel):
    """위협 로그 — lines 는 판정 등급별 로그 줄 수, days 는 날짜별 주의 · 위험 줄 수."""

    lines: LevelCounts
    days: list[ThreatDay]


class NodeGrade(BaseModel):
    level: Level
    at: str
    key: str


class StatNode(BaseModel):
    """노드 한 대의 기간 안 점검 — threats 는 마지막 판정의 주의 · 위험 항목 수."""

    node: str
    grades: list[NodeGrade]
    collected: int
    changed: int
    trend: str
    level: Level | None
    threats: ThreatCounts


class StatModule(BaseModel):
    module: str
    주의: int
    위험: int
    nodes: list[str]
    items: list[str]


class StatClause(BaseModel):
    source: str
    nodes: list[str]
    items: list[str]


class ServerStats(BaseModel):
    nodes: list[StatNode]
    modules: list[StatModule]
    clauses: list[StatClause]


class Stats(BaseModel):
    """보안 현황의 시스템 탭."""

    period: str
    since: str | None
    logs: LogTotals
    safety: SafetyScore
    events: EventStats
    servers: ServerStats


# --- 보안 현황: 사용자 ---


class ThreatUser(BaseModel):
    """주의 · 위험 판정을 받은 사용자 — keys 는 그 판정들의 key."""

    user: str
    log_id: str
    주의: int
    위험: int
    lines: int
    line_levels: ThreatCounts
    last_at: str
    keys: list[str]


class UserEvents(BaseModel):
    users: list[ThreatUser]


class RequestStats(BaseModel):
    """신청 수 — ai 는 AI 등급(판정 없음 · 판정 실패 포함)별 수, mismatches 는 AI 와 결재가 엇갈린 수."""

    total: int
    ai: dict[str, int]
    mismatches: int


class SuspectSignals(BaseModel):
    """행동 신호 — 최근 7일을 그 앞 4주와 견준 값. 로그가 없는 사람은 빈 객체입니다."""

    subject: str | None = None
    first_seen: str | None = None
    last_seen: str | None = None
    recent_events: int | None = None
    baseline_events: int | None = None
    recent_daily_volume: float | None = None
    baseline_daily_volume: float | None = None
    volume_ratio: float | None = None
    off_hours_ratio: float | None = None
    exception_ratio: float | None = None
    sensitive_events: int | None = None
    sensitive_words: list[str] | None = None
    max_burst_30min: int | None = None
    new_account: bool | None = None
    highlights: list[str] | None = None


class SuspectPoint(BaseModel):
    score: int
    at: str


class HeldAccess(BaseModel):
    """지금 가진 권한 한 건."""

    request_no: str
    code: str | None
    access: str
    system: str
    category: str
    period_end: str


class Suspect(judged.SuspectScore):
    """한 사람의 마지막 의심 점수 — 예측에 실패했으면 score · level 이 null 입니다. held 는 계정 미연결이면 null."""

    score: int | None
    key: str
    subject: str
    log_id: str
    login_id: str | None
    level: Literal["높음", "보통", "낮음"] | None
    signals: SuspectSignals
    records: dict[str, int]
    failed: bool
    error: str | None
    created_at: str
    model: str
    grounding: dict[str, Any]
    trend: list[SuspectPoint]
    held: list[HeldAccess] | None


class UserStats(BaseModel):
    """보안 현황의 사용자 탭."""

    period: str
    since: str | None
    events: UserEvents
    requests: RequestStats
    suspects: list[Suspect]
    safety: SafetyScore


# --- 보안 현황: 종합 ---


class RowDecision(BaseModel):
    action: str
    label: str
    by: str
    at: str


class OverviewRow(BaseModel):
    """열린 판정 한 건 — level 이 null 이면 판정 실패."""

    area: OverviewArea
    area_label: str
    key: str
    subject: str
    level: Level | None
    reason: str
    opened_at: str
    decision: RowDecision | None


class ActionCounts(BaseModel):
    total: int
    undecided: int
    acting: int


class Completion(BaseModel):
    done: int
    waiting: int
    rate: int | None


class OverviewCounts(BaseModel):
    위험: int
    주의: int
    action: ActionCounts
    completion: Completion
    failed: int


class AreaCounts(BaseModel):
    area: OverviewArea
    label: str
    위험: int
    주의: int
    failed: int


class Todo(judged.Todo):
    """AI 비서가 고른 할 일 — item 은 그때 붙인 번호, key 는 그 판정."""

    key: str
    subject: str
    level: Level | None


class BriefingArea(BaseModel):
    area: OverviewArea
    label: str
    todos: list[Todo]


class Briefing(BaseModel):
    """마지막 AI 비서 — current 는 그 뒤 열린 것 · 결정이 그대로인지."""

    headline: str
    areas: list[BriefingArea]
    failed: bool
    error: str | None
    model: str
    elapsed_sec: float | None
    created_at: str
    checks: list[str]
    current: bool


class OverviewDone(BaseModel):
    """최근 조치 한 건 — 완료율의 완료로 센 것 (조치 완료 결정 · 회수)."""

    area: OverviewArea
    area_label: str
    key: str
    subject: str
    at: str
    label: str
    by: str | None
    note: str  # 운영자 의견 · 회수 사유 (없으면 빈 글)


class Overview(BaseModel):
    """보안 현황 종합 — 열린 것은 기간과 무관하고 완료율 · 추이만 기간 안에서 셉니다."""

    period: str
    generated_at: str
    since: str | None
    counts: OverviewCounts
    areas: list[AreaCounts]
    trend: list[ThreatDay]
    top: list[OverviewRow]
    failed: list[OverviewRow]
    recent: list[OverviewDone]
    briefing: Briefing | None


# --- 로그 조회 ---


class LogFacts(BaseModel):
    """거른 로그의 집계 — attribute_totals 는 숫자로 읽히는 항목의 합."""

    count: int
    first: str | None
    last: str | None
    by_user: dict[str, int]
    by_solution: dict[str, int]
    by_how: dict[str, int]
    by_day: dict[str, int]
    attribute_totals: dict[str, int | float]


class LogEvent(BaseModel):
    """로그 한 줄 — user 는 "부서 이름", attributes 는 솔루션마다 다른 칸."""

    solution: str
    occurred_at: str
    who: str
    where: str
    how: str
    user_id: str
    user_name: str
    department: str
    source_ip: str
    tenant_id: str
    attributes: dict[str, str]
    user: str


class LogOptions(BaseModel):
    """거르기 칸에 보일 값 — 로그 전체 기준."""

    users: list[str]
    solutions: list[str]
    how: list[str]
    first: str | None
    last: str | None


class LogsPage(BaseModel):
    """로그 조회 한 쪽 — 최신순."""

    period: str
    since: str | None
    until: str
    criteria: dict[str, str]
    total: int
    page: int
    page_size: int
    facts: LogFacts
    events: list[LogEvent]
    options: LogOptions
    load_issues: list[str]


# --- 질의 ---


class AskStep(BaseModel):
    """질의 에이전트가 부른 도구 한 번 — facts · criteria 는 도구마다 칸이 다릅니다. by 는 모델이 아니라 코드가 불렀을 때만 옵니다."""

    tool: str | None
    args: dict[str, Any]
    by: str | None = None
    summary: str | None = None
    error: str | None = None
    facts: dict[str, Any] | None = None
    evidence: list[str] | None = None
    sources: list[str] | None = None
    criteria: dict[str, Any] | None = None


class AskAnswer(BaseModel):
    """질의의 답 — stages 는 세운 기준 · 고른 근거 · 단계별 초, checks 는 검증에서 어긋난 것."""

    answer: str
    steps: list[AskStep]
    sources: list[str]
    checks: list[str]
    restarts: int
    stages: dict[str, Any]
    failed: bool
    error: str | None
    elapsed_sec: float
    id: int
    conversation_id: str


class QaRecord(BaseModel):
    """질의 기록의 한 턴."""

    id: int
    kind: str
    question: str
    answer: str
    sources: list[str]
    criteria: dict[str, Any]
    facts: dict[str, Any] | None
    evidence: list[str]
    failed: bool
    error: str | None
    model: str
    elapsed_sec: float | None
    asker_id: int
    asker_name: str
    asker_department: str
    asked_at: str
    conversation_id: str | None
    steps: list[AskStep]
    checks: list[str]
    stages: dict[str, Any]


class Conversation(BaseModel):
    """내 대화 하나 — 첫 질문 · 턴 수 · 마지막 시각."""

    conversation_id: str
    question: str
    turns: int
    asked_at: str
