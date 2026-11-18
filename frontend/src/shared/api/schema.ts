// 자동 생성 — 손으로 고치지 않습니다. 백엔드의 요청 · 응답 모델을 고친 뒤 `python -m sentinelai.dev api-types` 로 다시 만듭니다.

export interface AccessChange {
  name?: string | null;
  system?: string | null;
  category?: string | null;
  description?: string | null;
  is_active?: boolean | null;
}

/** 권한 목록의 한 건. */
export interface AccessItem {
  id: number;
  code: string;
  name: string;
  system: string;
  category: string;
  description: string;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ActionCounts {
  total: number;
  undecided: number;
  acting: number;
}

/** 결재 한 단계 — ai_level 은 결재자가 본 AI 등급이고 일반 사용자에게는 주지 않습니다. */
export interface Approval {
  step: "manager" | "top";
  action: "approve" | "reject";
  comment: string;
  approver_id: number;
  approver_name: string;
  approver_department: string | null;
  decided_at: string;
  ai_level?: "정상" | "주의" | "위험" | null;
}

export interface AreaCounts {
  area: "policy" | "server" | "event" | "suspect" | "grant";
  label: string;
  "위험": number;
  "주의": number;
  failed: number;
}

/** 질의의 답 — stages 는 세운 기준 · 고른 근거 · 단계별 초, checks 는 검증에서 어긋난 것. */
export interface AskAnswer {
  answer: string;
  steps: AskStep[];
  sources: string[];
  checks: string[];
  restarts: number;
  stages: Record<string, unknown>;
  failed: boolean;
  error: string | null;
  elapsed_sec: number;
  id: number;
  conversation_id: string;
}

export interface AskRequest {
  question: string;
  conversation_id?: string | null;
}

/** 질의 에이전트가 부른 도구 한 번 — facts · criteria 는 도구마다 칸이 다릅니다. by 는 모델이 아니라 코드가 불렀을 때만 옵니다. */
export interface AskStep {
  tool: string | null;
  args: Record<string, unknown>;
  by?: string | null;
  summary?: string | null;
  error?: string | null;
  facts?: Record<string, unknown> | null;
  evidence?: string[] | null;
  sources?: string[] | null;
  criteria?: Record<string, unknown> | null;
}

/** 변경 이력의 한 줄 — detail 은 기록마다 칸이 다릅니다 (사유 또는 바뀐 칸과 값). */
export interface AuditRow {
  id: number;
  at: string;
  action: string;
  by: string;
  detail: Record<string, unknown>;
}

/** 마지막 AI 비서 — current 는 그 뒤 열린 것 · 결정이 그대로인지. */
export interface Briefing {
  headline: string;
  areas: BriefingArea[];
  failed: boolean;
  error: string | null;
  model: string;
  elapsed_sec: number | null;
  created_at: string;
  checks: string[];
  current: boolean;
}

export interface BriefingArea {
  area: "policy" | "server" | "event" | "suspect" | "grant";
  label: string;
  todos: Todo[];
}

export interface Completion {
  done: number;
  waiting: number;
  rate: number | null;
}

/** 내 대화 하나 — 첫 질문 · 턴 수 · 마지막 시각. */
export interface Conversation {
  conversation_id: string;
  question: string;
  turns: number;
  asked_at: string;
}

/** 한 판정의 지금 결정 — 결과가 같은 지난 판정에서 이어받았으면 carried_from 에 그 판정의 key. */
export interface Decision {
  id: number;
  kind: "policy" | "event" | "server" | "suspect";
  item_key: string;
  subject: string;
  action: string;
  comment: string;
  ai_level: "정상" | "주의" | "위험" | null;
  decider_id: number;
  decider_name: string;
  decider_department: string;
  decided_at: string;
  carried_from?: string | null;
}

export interface DecisionBody {
  action: string;
  comment?: string;
}

/** 운영자 결정 한 건 (권한 DB 의 결정 기록 한 줄). */
export interface DecisionRecord {
  id: number;
  kind: "policy" | "event" | "server" | "suspect";
  item_key: string;
  subject: string;
  action: string;
  comment: string;
  ai_level: "정상" | "주의" | "위험" | null;
  decider_id: number;
  decider_name: string;
  decider_department: string;
  decided_at: string;
}

/** 결정을 적은 결과 — decision 은 지금 결정이고 취소면 null. */
export interface DecisionResult {
  kind: string;
  item_key: string;
  decision: DecisionRecord | null;
}

export interface EditRegulation {
  content: string;
  reason: string;
}

/** 판정한 로그 묶음 — events 는 한 줄에 로그 하나. */
export interface EventDetail {
  events: string;
  first_event_at: string;
  last_event_at: string;
}

/** 로그 감시 판정 한 건(주의 이상만) — stage 가 fast 면 아직 확정 전인 1차 판정입니다. */
export interface EventFinding {
  level: "정상" | "주의" | "위험";
  reason: string;
  sources: string[];
  recommendation: string;
  id: string;
  key: string;
  title: string;
  detail: EventDetail;
  elapsed_sec: number | null;
  failed: boolean;
  stage: "fast" | "final";
}

/** 위협 로그 — lines 는 판정 등급별 로그 줄 수, days 는 날짜별 주의 · 위험 줄 수. */
export interface EventStats {
  lines: LevelCounts;
  days: ThreatDay[];
}

/** PDF 에서 꺼낸 글 — 저장하지 않고 사람이 보고 고친 뒤 올립니다. */
export interface ExtractedPdf {
  text: string;
  pages: number;
  empty_pages: number[];
}

export interface ExtractedTables {
  tables: XlsxTable[];
}

/** 빠른 로그 감시의 상태와 예약. */
export interface FastJobs {
  running: string | null;
  auto: boolean;
  done: number;
  total: number;
  started_at: string | null;
  last: Record<string, LastRun>;
  every_min: number;
  next_at: string;
}

/** 받은 뒤 재검토 — 퇴사(leave)면 left_on, 이동(move)이면 move 가 오고 판정 전이면 verdict 가 null 입니다. */
export interface GrantReview {
  cause: "leave" | "move";
  left_on?: string | null;
  move?: UserMove | null;
  verdict: GrantVerdict | null;
  judging?: boolean | null;
}

/** 보유 권한 재검토의 판정 — by 가 code 면 퇴사라 코드가 정한 것이고 근거 확인(grounding)이 없습니다. */
export interface GrantVerdict {
  level: "정상" | "주의" | "위험" | null;
  reason: string;
  sources: string[];
  recommendation: string;
  failed: boolean;
  error: string | null;
  model: string | null;
  elapsed_sec: number | null;
  judged_at: string | null;
  grounding?: Record<string, unknown> | null;
  by: "code" | "ai";
}

export interface HTTPValidationError {
  detail?: ValidationError[];
}

/** AI 엔진 상태 — 모두 준비되면 ok. */
export interface Health {
  base_url: string;
  model: string;
  qa_model: string;
  embedding_model: string;
  connected: boolean;
  model_ready: boolean;
  qa_model_ready: boolean;
  embedding_ready: boolean;
  error: string | null;
  index_ready: boolean;
  ok: boolean;
}

/** 지금 가진 권한 한 건. */
export interface HeldAccess {
  request_no: string;
  code: string | null;
  access: string;
  system: string;
  category: string;
  period_end: string;
}

/** 작업 막대 — running 은 도는 작업이고, 없는데 기다리는 작업이 있으면 그 첫 작업(queued). fast 는 빠른 감시를 켰을 때만 옵니다. */
export interface Jobs {
  running: string | null;
  auto: boolean;
  done: number;
  total: number;
  started_at: string | null;
  queued: boolean;
  last: Record<string, LastRun>;
  waiting: QueueUnit[];
  fast?: FastJobs | null;
  kinds: Record<string, string>;
}

/** 한 종류의 마지막 실행 — error 가 있으면 실패했거나 강제로 끝낸 것. */
export interface LastRun {
  finished_at: string;
  error: string | null;
  auto: boolean;
}

export interface LevelCounts {
  "정상": number;
  "주의": number;
  "위험": number;
}

/** 로그 한 줄 — user 는 "부서 이름", attributes 는 솔루션마다 다른 칸. */
export interface LogEvent {
  solution: string;
  occurred_at: string;
  who: string;
  where: string;
  how: string;
  user_id: string;
  user_name: string;
  department: string;
  source_ip: string;
  tenant_id: string;
  attributes: Record<string, string>;
  user: string;
}

/** 거른 로그의 집계 — attribute_totals 는 숫자로 읽히는 항목의 합. */
export interface LogFacts {
  count: number;
  first: string | null;
  last: string | null;
  by_user: Record<string, number>;
  by_solution: Record<string, number>;
  by_how: Record<string, number>;
  by_day: Record<string, number>;
  attribute_totals: Record<string, number>;
}

/** 거르기 칸에 보일 값 — 로그 전체 기준. */
export interface LogOptions {
  users: string[];
  solutions: string[];
  how: string[];
  first: string | null;
  last: string | null;
}

/** 기간 안 로그 수 — 로그를 읽지 못하면 count 가 null 이고 error 에 원인이 옵니다. */
export interface LogTotals {
  count: number | null;
  days: Record<string, number>;
  error?: string | null;
}

export interface LoginBody {
  login_id: string;
  password: string;
}

/** 로그 조회 한 쪽 — 최신순. */
export interface LogsPage {
  period: string;
  since: string | null;
  until: string;
  criteria: Record<string, string>;
  total: number;
  page: number;
  page_size: number;
  facts: LogFacts;
  events: LogEvent[];
  options: LogOptions;
  load_issues: string[];
}

/** 로그인한 사람 · 계정을 만들거나 고친 결과. */
export interface Me {
  id: number;
  login_id: string;
  display_name: string;
  department: string;
  role: "user" | "manager" | "top";
  is_root: boolean;
  must_change_password: boolean;
}

/** 지운 기준 문서의 이름. */
export interface Named {
  name: string;
}

export interface NewAccess {
  code: string;
  name: string;
  system?: string;
  category?: string;
  description?: string;
}

export interface NewNode {
  name: string;
}

export interface NewRegulation {
  name: string;
  content: string;
  source?: string | null;
}

export interface NewRequest {
  access_code: string;
  reason?: string;
  period_start?: string;
  period_end?: string;
}

export interface NewUser {
  login_id: string;
  password: string;
  display_name: string;
  department?: string;
  job?: string;
  email?: string;
  role: string;
}

/** 수집 노드 한 대 — 키 자체는 빼고 발급 여부만. */
export interface Node {
  name: string;
  host: string;
  ip: string;
  agent_version: string;
  interval_min: number;
  registered_at: string;
  last_seen_at: string | null;
  last_collected_at: string | null;
  enabled: boolean;
  key_issued: boolean;
}

export interface NodeChange {
  enabled: boolean;
}

/** 노드 하나 — 키 · 최근 수집 · 판정 기록. 해시만 남은 예전 키는 key 가 null 입니다. */
export interface NodeDetail {
  name: string;
  host: string;
  ip: string;
  agent_version: string;
  interval_min: number;
  registered_at: string;
  last_seen_at: string | null;
  last_collected_at: string | null;
  enabled: boolean;
  key_issued: boolean;
  stale: boolean;
  key: string | null;
  latest: Snapshot | null;
  snapshots: SnapshotBrief[];
  findings: NodeFindingBrief[];
}

/** 한 노드의 지난 서버 점검 한 건. */
export interface NodeFindingBrief {
  key: string;
  snapshot_id: number;
  level: "정상" | "주의" | "위험" | null;
  failed: boolean;
  summary: string;
  created_at: string;
}

export interface NodeGrade {
  level: "정상" | "주의" | "위험";
  at: string;
  key: string;
}

/** 노드 목록의 한 줄 — stale 은 간격의 세 배 넘게 소식 없음, level 은 마지막 서버 점검 등급. */
export interface NodeRow {
  name: string;
  host: string;
  ip: string;
  agent_version: string;
  interval_min: number;
  registered_at: string;
  last_seen_at: string | null;
  last_collected_at: string | null;
  enabled: boolean;
  key_issued: boolean;
  stale: boolean;
  level: "정상" | "주의" | "위험" | null;
  finding_failed: boolean;
}

/** 등록하거나 키를 다시 발급한 결과. */
export interface NodeWithKey {
  name: string;
  host: string;
  ip: string;
  agent_version: string;
  interval_min: number;
  registered_at: string;
  last_seen_at: string | null;
  last_collected_at: string | null;
  enabled: boolean;
  key_issued: boolean;
  key: string;
}

/** 돌려줄 내용 없이 끝난 일. */
export interface Ok {
  ok: boolean;
}

/** 보안 현황 종합 — 열린 것은 기간과 무관하고 완료율 · 추이만 기간 안에서 셉니다. */
export interface Overview {
  period: string;
  generated_at: string;
  since: string | null;
  counts: OverviewCounts;
  areas: AreaCounts[];
  trend: ThreatDay[];
  top: OverviewRow[];
  failed: OverviewRow[];
  recent: OverviewDone[];
  briefing: Briefing | null;
}

export interface OverviewCounts {
  "위험": number;
  "주의": number;
  action: ActionCounts;
  completion: Completion;
  failed: number;
}

/** 최근 조치 한 건 — 완료율의 완료로 센 것 (조치 완료 결정 · 회수). */
export interface OverviewDone {
  area: "policy" | "server" | "event" | "suspect" | "grant";
  area_label: string;
  key: string;
  subject: string;
  at: string;
  label: string;
  by: string | null;
  note: string;
}

/** 열린 판정 한 건 — level 이 null 이면 판정 실패. */
export interface OverviewRow {
  area: "policy" | "server" | "event" | "suspect" | "grant";
  area_label: string;
  key: string;
  subject: string;
  level: "정상" | "주의" | "위험" | null;
  reason: string;
  opened_at: string;
  decision: RowDecision | null;
}

export interface PasswordBody {
  current: string;
  new: string;
}

export interface PasswordReset {
  temporary_password: string;
}

/** 정책 관리 검토가 찾은 문제 한 건. */
export interface PolicyIssue {
  kind: "중복" | "충돌" | "과도한 허용";
  level: "정상" | "주의" | "위험";
  policy_ids: string[];
  reason: string;
  recommendation: string;
  key: string;
  seq: number;
}

/** 마지막 정책 관리 검토 — 판정에 실패했으면 summary 에 원인이 오고 issues 가 빕니다. */
export interface PolicyReview {
  summary: string;
  issues: PolicyIssue[];
  elapsed_sec: number | null;
}

/** 질의 기록의 한 턴. */
export interface QaRecord {
  id: number;
  kind: string;
  question: string;
  answer: string;
  sources: string[];
  criteria: Record<string, unknown>;
  facts: Record<string, unknown> | null;
  evidence: string[];
  failed: boolean;
  error: string | null;
  model: string;
  elapsed_sec: number | null;
  asker_id: number;
  asker_name: string;
  asker_department: string;
  asked_at: string;
  conversation_id: string | null;
  steps: AskStep[];
  checks: string[];
  stages: Record<string, unknown>;
}

/** 큐 화면 — 도는 잡 · 길마다 기다리는 잡 · 열린 묶음 · 종류마다 마지막 실행. */
export interface QueueDetail {
  jobs: Jobs;
  schedule: Record<string, Schedule>;
  verdicts: VerdictQueue;
  generation: number;
  current: QueueJob | null;
  lanes: QueueLane[];
  batches: QueueUnit[];
  last: Record<string, LastRun>;
  labels: Record<string, string>;
}

/** 큐 화면의 잡 한 줄 — close 는 묶음을 닫는 잡, batch 는 속한 묶음의 id. */
export interface QueueJob {
  id: number;
  kind: string;
  key: string;
  status: string;
  auto: boolean;
  done: number;
  total: number;
  created_at: string;
  started_at: string | null;
  lane: number;
  close: boolean;
  batch: number | null;
}

export interface QueueLane {
  lane: number;
  name: string;
  jobs: QueueJob[];
}

/** 작업 큐 · 자동 실행 예약 · 판정 대기열. */
export interface QueueStatus {
  jobs: Jobs;
  schedule: Record<string, Schedule>;
  verdicts: VerdictQueue;
}

/** 기다리거나 도는 작업 하나 — 묶음이면 done · total 이 진행입니다. */
export interface QueueUnit {
  id: number;
  kind: string;
  key: string;
  status: string;
  auto: boolean;
  done: number;
  total: number;
  created_at: string;
  started_at: string | null;
}

/** 기준 문서 한 개 — 원문과 고친 시각. */
export interface Regulation {
  name: string;
  content: string;
  updated_at: string;
}

/** 문서마다 RAG 에 쌓인 조각 수 — 벡터 DB 에 닿지 않거나 비었으면 빈 칸입니다. */
export interface RegulationIndex {
  chunks: Record<string, number>;
}

/** 다시 판정을 큐에 넣은 결과. */
export interface Rejudging {
  request_no: string;
  judging: boolean;
}

export interface RemoveRegulation {
  reason: string;
}

/** 권한 신청 한 건 — ai_verdict · grant_review · judging 은 일반 사용자에게 주지 않습니다. */
export interface RequestRow {
  id: number;
  request_no: string;
  requester_id: number;
  requester_name: string;
  requester_department: string;
  requester_job: string;
  requested_access: string;
  access_code: string | null;
  current_access: string;
  reason: string;
  period_start: string;
  period_end: string;
  stage: "manager" | "top" | "approved" | "rejected" | "withdrawn" | "revoked";
  submitted_at: string;
  closed_at: string | null;
  ai_verdict?: Verdict | null;
  approvals: Approval[];
  grant_review?: GrantReview | null;
  revocation: Revocation | null;
  judging?: boolean | null;
}

/** 신청 수 — ai 는 AI 등급(판정 없음 · 판정 실패 포함)별 수, mismatches 는 AI 와 결재가 엇갈린 수. */
export interface RequestStats {
  total: number;
  ai: Record<string, number>;
  mismatches: number;
}

export interface ResetJobs {
  rerun?: boolean;
}

/** 검토 결과 — decisions 는 종류 → 판정 key → 지금 결정, decision_log(결정 기록 전부, 취소 포함)는 보안 운영자 이상 모두에게 줍니다. */
export interface Results {
  generated_at: string | null;
  summary: Summary;
  sections: Record<string, Section | null>;
  policy_review: PolicyReview | null;
  servers: ServerFinding[];
  events: EventFinding[];
  event_levels: LevelCounts;
  decisions: Record<string, Record<string, Decision>>;
  decision_log?: Record<string, Record<string, DecisionRecord[]>> | null;
}

export interface ReviewDecision {
  kind: string;
  item_key: string;
  action: string;
  subject?: string;
  comment?: string;
  ai_level?: string | null;
}

/** 권한 회수 기록. */
export interface Revocation {
  reason: string;
  revoker_id: number;
  revoker_name: string;
  revoker_department: string | null;
  revoked_at: string;
}

export interface RevokeBody {
  reason: string;
}

/** 권한 변동에 걸린 일 하나 — 이동 · 보유 권한 · 만료 미회수 · 이동 뒤 로그 감시 판정. */
export interface RiskFlag {
  kind: "move" | "grant" | "expired" | "event";
  level: "정상" | "주의" | "위험";
  at: string;
  text: string;
  request_no?: string | null;
  event_key?: string | null;
}

/** 권한 변동 — 부서 · 직무를 옮겼거나 사용 기간이 끝난 권한이 남은 사람. */
export interface RiskPeople {
  generated_at: string;
  people: RiskPerson[];
  log_error: string | null;
}

/** 권한이 달라진 사람 한 명 — log_id · log_user 는 로그 조회로 넘어갈 때 씁니다. */
export interface RiskPerson {
  id: number;
  login_id: string;
  name: string;
  department: string;
  job: string;
  is_active: boolean;
  left_on: string;
  level: "정상" | "주의" | "위험";
  at: string;
  flags: RiskFlag[];
  log_id: string;
  log_user: string;
}

export interface RowDecision {
  action: string;
  label: string;
  by: string;
  at: string;
}

export interface SafetyDay {
  day: string;
  score: number;
}

export interface SafetyItem {
  node: string;
  level: "정상" | "주의" | "위험" | null;
  stale: boolean;
}

/** 안전 점수 — items(노드마다 마지막 등급)는 시스템 안전 점수에만 옵니다. */
export interface SafetyScore {
  score: number | null;
  items?: SafetyItem[] | null;
  trend: SafetyDay[];
}

export interface Schedule {
  every_min: number;
  next_at: string;
}

/** 구역 하나의 마지막 실행 — load_issues 는 읽지 못한 로그 파일. */
export interface Section {
  generated_at: string;
  source: string;
  load_issues: string[];
}

export interface ServerDetail {
  snapshot: SnapshotState;
}

/** 노드 한 대의 마지막 서버 점검 — 판정 실패는 level 이 주의이고 reason 에 원인이 옵니다. gaps 에서 정상 항목은 뺍니다. */
export interface ServerFinding {
  level: "정상" | "주의" | "위험";
  reason: string;
  sources: string[];
  recommendation: string;
  id: string;
  key: string;
  title: string;
  detail: ServerDetail;
  gaps: ServerGap[];
  unjudged: string[];
  elapsed_sec: number | null;
  failed: boolean;
}

/** 서버의 지금 상태가 기준 문서와 다른 곳 한 군데와, 맞추려면 바꿀 것. */
export interface ServerGap {
  item: string;
  current: string;
  required: string;
  source: string;
  level: "정상" | "주의" | "위험";
  change: string;
}

export interface ServerStats {
  nodes: StatNode[];
  modules: StatModule[];
  clauses: StatClause[];
}

/** 수집 한 번 — modules 는 모듈 → 항목 → 값, changes 는 직전 수집과 달라진 설정. */
export interface Snapshot {
  id: number;
  node: string;
  host: string;
  ip: string;
  collected_at: string;
  collected_by: string;
  modules: Record<string, Record<string, string>>;
  changes: string[];
}

/** 최근 수집 목록의 한 줄. */
export interface SnapshotBrief {
  id: number;
  collected_at: string;
  changes: string[];
}

/** 수집을 받은 결과 — 같은 노드 · 수집 시각이 이미 있으면 stored 가 false. */
export interface SnapshotReceipt {
  node: string;
  stored: boolean;
}

/** 판정할 때 본 수집 — 수집을 찾지 못하면 빈 객체입니다. */
export interface SnapshotState {
  collected_at?: string | null;
  collected_by?: string | null;
  modules?: Record<string, Record<string, string>> | null;
  changes?: string[] | null;
}

export interface StatClause {
  source: string;
  nodes: string[];
  items: string[];
}

export interface StatModule {
  module: string;
  "주의": number;
  "위험": number;
  nodes: string[];
  items: string[];
}

/** 노드 한 대의 기간 안 점검 — threats 는 마지막 판정의 주의 · 위험 항목 수. */
export interface StatNode {
  node: string;
  grades: NodeGrade[];
  collected: number;
  changed: number;
  trend: string;
  level: "정상" | "주의" | "위험" | null;
  threats: ThreatCounts;
}

/** 보안 현황의 시스템 탭. */
export interface Stats {
  period: string;
  since: string | null;
  logs: LogTotals;
  safety: SafetyScore;
  events: EventStats;
  servers: ServerStats;
}

/** 세 구역을 합친 건수 — 판정 실패는 주의로 셉니다. */
export interface Summary {
  total: number;
  "정상": number;
  "주의": number;
  "위험": number;
  policy_issue_count: number;
  server_count: number;
  event_count: number;
  failed: number;
}

/** 한 사람의 마지막 의심 점수 — 예측에 실패했으면 score · level 이 null 입니다. held 는 계정 미연결이면 null. */
export interface Suspect {
  score: number | null;
  reason: string;
  watch: string;
  key: string;
  subject: string;
  log_id: string;
  login_id: string | null;
  level: "높음" | "보통" | "낮음" | null;
  signals: SuspectSignals;
  records: Record<string, number>;
  failed: boolean;
  error: string | null;
  created_at: string;
  model: string;
  grounding: Record<string, unknown>;
  trend: SuspectPoint[];
  held: HeldAccess[] | null;
}

export interface SuspectPoint {
  score: number;
  at: string;
}

/** 행동 신호 — 최근 7일을 그 앞 4주와 견준 값. 로그가 없는 사람은 빈 객체입니다. */
export interface SuspectSignals {
  subject?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  recent_events?: number | null;
  baseline_events?: number | null;
  recent_daily_volume?: number | null;
  baseline_daily_volume?: number | null;
  volume_ratio?: number | null;
  off_hours_ratio?: number | null;
  exception_ratio?: number | null;
  sensitive_events?: number | null;
  sensitive_words?: string[] | null;
  max_burst_30min?: number | null;
  new_account?: boolean | null;
  highlights?: string[] | null;
}

export interface ThreatCounts {
  "주의": number;
  "위험": number;
}

/** 하루의 주의 · 위험 수. */
export interface ThreatDay {
  day: string;
  "주의": number;
  "위험": number;
}

/** 주의 · 위험 판정을 받은 사용자 — keys 는 그 판정들의 key. */
export interface ThreatUser {
  user: string;
  log_id: string;
  "주의": number;
  "위험": number;
  lines: number;
  line_levels: ThreatCounts;
  last_at: string;
  keys: string[];
}

/** AI 비서가 고른 할 일 — item 은 그때 붙인 번호, key 는 그 판정. */
export interface Todo {
  item: string;
  task: string;
  why: string;
  key: string;
  subject: string;
  level: "정상" | "주의" | "위험" | null;
}

export interface UserChange {
  display_name?: string | null;
  department?: string | null;
  job?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  log_id?: string | null;
  left_on?: string | null;
  email?: string | null;
}

export interface UserEvents {
  users: ThreatUser[];
}

/** 부서 · 직무 이동 한 번. */
export interface UserMove {
  id: number;
  from_department: string;
  from_job: string;
  to_department: string;
  to_job: string;
  moved_on: string;
}

/** 계정 목록의 한 줄. */
export interface UserRow {
  id: number;
  login_id: string;
  display_name: string;
  department: string;
  role: "user" | "manager" | "top";
  is_root: boolean;
  must_change_password: boolean;
  is_active: boolean;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  log_id: string;
  job: string;
  left_on: string;
  email: string;
}

/** 보안 현황의 사용자 탭. */
export interface UserStats {
  period: string;
  since: string | null;
  events: UserEvents;
  requests: RequestStats;
  suspects: Suspect[];
  safety: SafetyScore;
}

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

/** 저장된 AI 판정 — 판정에 실패했으면 failed 가 true 이고 level 이 없습니다. */
export interface Verdict {
  level: "정상" | "주의" | "위험" | null;
  reason: string;
  sources: string[];
  recommendation: string;
  failed: boolean;
  error: string | null;
  model: string | null;
  elapsed_sec: number | null;
  judged_at: string | null;
  grounding: Record<string, unknown>;
}

/** 권한 신청 · 보유 권한 재검토 판정의 대기열 — 엔진이 뜨기 전에는 빈 객체입니다. */
export interface VerdictQueue {
  current?: string | null;
  waiting?: string[] | null;
}

/** 사람에게 걸린 일 하나 — 퇴사 · 이동 · 보유 권한 · 결재 중 신청. */
export interface WatchFlag {
  kind: "leave" | "move" | "grant" | "request";
  level: "정상" | "주의" | "위험";
  at: string;
  text: string;
  request_no?: string | null;
}

/** 걸린 일이 있는 사람 한 명 — level · at 은 걸린 일 중 가장 높은 등급 · 가장 늦은 날. */
export interface WatchPerson {
  id: number;
  login_id: string;
  name: string;
  department: string;
  job: string;
  is_active: boolean;
  left_on: string;
  level: "정상" | "주의" | "위험";
  at: string;
  flags: WatchFlag[];
}

export interface XlsxRow {
  cells: string[];
  notes: string[];
}

/** 엑셀의 표 하나 — personal 은 사람 기록(사번 · 이름)이 든 표라 화면이 처음부터 빼 둡니다. */
export interface XlsxTable {
  sheet: string;
  title: string;
  intro: string[];
  columns: string[];
  rows: XlsxRow[];
  personal: boolean;
}
