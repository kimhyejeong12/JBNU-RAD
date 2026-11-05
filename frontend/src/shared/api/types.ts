// 서버는 dict 를 돌려주므로 화면이 쓰는 칸만 적습니다.

export type Role = "user" | "manager" | "top";
export type Level = "정상" | "주의" | "위험";

export interface Me {
  id: number;
  login_id: string;
  display_name: string;
  department: string | null;
  role: Role;
  is_root: boolean;
  must_change_password: boolean;
}

export interface Health {
  ok: boolean;
  connected: boolean;
  model: string;
  model_ready: boolean;
  qa_model: string;
  qa_model_ready: boolean;
  embedding_model: string;
  embedding_ready: boolean;
  index_ready: boolean;
}

export interface Regulation {
  name: string;
  content: string;
  updated_at?: string;
}

export type Stage = "manager" | "top" | "approved" | "rejected" | "withdrawn" | "revoked";

export interface Verdict {
  level: Level;
  reason: string;
  recommendation: string;
  sources: string[];
  failed?: boolean;
  error?: string | null;
  judged_at?: string | null;
}

export interface Approval {
  step: "manager" | "top";
  action: "approve" | "reject";
  approver_name: string;
  approver_department: string | null;
  decided_at: string;
  ai_level: string | null;
  comment: string | null;
}

export interface Revocation {
  revoker_name: string;
  revoker_department: string | null;
  revoked_at: string;
  reason: string;
}

export interface RequestRow {
  request_no: string;
  requester_name: string;
  requester_department: string;
  requester_job?: string;
  requested_access: string;
  access_code: string | null;
  current_access: string | null;
  reason: string | null;
  period_start: string | null;
  period_end: string | null;
  submitted_at: string;
  stage: Stage;
  ai_verdict?: Verdict | null;   // 일반 사용자에게는 없습니다
  judging?: boolean;
  approvals?: Approval[];
  grant_review?: GrantReview | null;   // 퇴사 · 이동 재검토. 일반 사용자에게는 없습니다
  revocation?: Revocation | null;
}

export interface WatchFlag {
  kind: "leave" | "move" | "grant" | "request";
  level: Level;
  at: string;
  text: string;
  request_no?: string;
}

export interface WatchPerson {
  id: number;
  login_id: string;
  name: string;
  department: string;
  job: string;
  is_active: boolean;
  left_on: string;
  level: Level;
  at: string;
  flags: WatchFlag[];
}

export interface UserMove {
  id: number;
  from_department: string;
  from_job: string;
  to_department: string;
  to_job: string;
  moved_on: string;
}

export interface GrantReview {
  cause: "leave" | "move";
  left_on?: string;
  move?: UserMove;
  verdict: (Verdict & { by: "code" | "ai" }) | null;   // move 이고 아직 판정 전이면 null
  judging?: boolean;
}

export interface AccessItem {
  code: string;
  name: string;
  system: string | null;
  category: string | null;
  description: string | null;
  is_active: boolean;
  updated_at: string | null;
  created_at: string | null;
}

export interface UserRow {
  id: number;
  login_id: string;
  display_name: string;
  department: string | null;
  role: Role;
  is_root: boolean;
  is_active: boolean;
  must_change_password: boolean;
  locked_until: string | null;
  last_login_at: string | null;
  log_id: string | null;
  job: string;
  left_on: string;
  created_at: string;
}

export interface PolicyIssue {
  key: string;
  kind: string;
  level: Level;
  policy_ids: string[];
  reason: string;
  recommendation: string;
  sources?: string[];
}

export interface Snapshot {
  collected_at?: string | null;
  collected_by?: string | null;
  modules?: Record<string, Record<string, string>>;
  changes?: string[];
}

export interface ServerGap {
  level: Level;
  item: string;
  current: string;
  required: string;
  change: string;
  source?: string | null;
}

export interface ServerFinding {
  key: string;
  id: string;
  title: string;
  level: Level;
  reason: string;
  recommendation?: string | null;   // 10/14 전 결과에만 있음
  sources?: string[];
  gaps: ServerGap[];
  unjudged: string[];
  failed?: boolean;
  detail?: { snapshot?: Snapshot | null };
}

export interface EventFinding {
  key: string;
  id: string;
  title: string;
  level: Level;
  reason: string;
  recommendation: string;
  sources: string[];
  failed?: boolean;
  stage?: "fast" | "final";
  detail?: { events?: string; last_event_at?: string | null; user?: string };
}

export interface Section {
  source: string;
  generated_at: string | null;
  load_issues: string[];
}

export interface Decision {
  action: string;
  decider_name: string;
  decider_department?: string | null;
  decided_at: string;
  comment: string | null;
  ai_level: string | null;
  carried_from?: string;   // 결정을 이어받았으면 그 지난 판정의 key
}

export interface Results {
  summary: { failed: number } & Partial<Record<Level, number>>;
  sections: Record<string, Section | null>;
  servers: ServerFinding[];
  events: EventFinding[];
  policy_review: { issues: PolicyIssue[] } | null;
  generated_at: string | null;
  decisions?: Record<string, Record<string, Decision>>;
  decision_log?: Record<string, Record<string, Decision[]>>;   // 보안 총책임자에게만
}

export type JobKind = "policies" | "nodes" | "suspects";

export interface Jobs {
  running: string | null;
  auto?: boolean;
  done?: number;
  total?: number;
  kinds: Record<string, string>;
  last?: Record<string, { finished_at?: string | null; error?: string | null }>;
  fast?: { every_min: number; next_at: string | null; last: Record<string, { finished_at?: string | null }>; running?: string | null };
}

export interface ServerFacts {
  "노드 수": number;
  "마지막 판정 등급별 노드 수"?: Record<string, number>;
  "기간 안 첫 수집"?: string | null;
  "기간 안 마지막 수집"?: string | null;
  "노드별"?: Record<string, { "수집": number; "바뀐 설정": number; "판정": Record<string, number> }>;
}

// 질의 에이전트가 부른 도구 한 번 — 화면의 근거 칩 · 패널이 됩니다.
export interface AskStep {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  facts?: LogFacts | ServerFacts | null;
  evidence?: string[];
  sources?: string[];
  criteria?: Record<string, string>;
  error?: string;
}

export interface AskAnswer {
  answer: string;
  steps?: AskStep[];
  sources?: string[];
  checks?: string[];
  restarts?: number;
  failed?: boolean;
  error?: string | null;
  elapsed_sec?: number | null;
  conversation_id?: string;
}

export interface QaRecord extends AskAnswer {
  id: number;
  question: string;
  asked_at: string;
}

export interface Conversation {
  conversation_id: string;
  question: string;
  turns: number;
  asked_at: string;
}

// started 가 있으면 답을 기다리는 중입니다.
export interface AskItem extends Partial<AskAnswer> {
  id: string;
  q: string;
  started: number | null;
}

export type LogPeriod = "day" | "week" | "month" | "all";
export type StatPeriod = "week" | "month" | "quarter" | "all";

export interface LogsParams {
  period: LogPeriod;
  user: string;
  solution: string;
  how: string;
  page: number;
}

export interface NodeRow {
  name: string;
  host: string | null;
  ip: string | null;
  enabled: boolean;
  key_issued: boolean;
  stale: boolean;               // 간격의 세 배 넘게 소식 없음
  interval_min: number | null;
  agent_version: string | null;
  registered_at: string | null;
  last_seen_at: string | null;
  last_collected_at: string | null;
  level: Level | null;          // 마지막 서버 점검 등급
}

export interface NodeFindingBrief {
  key: string;
  level: Level | null;
  failed?: boolean;
  created_at: string;
  summary: string;
}

export interface NodeDetail {
  name: string;
  key?: string | null;          // 해시만 남은 예전 키는 없음
  findings: NodeFindingBrief[];
  latest: Snapshot | null;
  snapshots: { collected_at: string; changes: string[] }[];
}

export interface LogEvent {
  occurred_at: string;
  user: string;              // "부서 이름"
  user_id?: string | null;
  solution: string;
  where: string;
  how: string;
  source_ip?: string | null;
  attributes?: Record<string, string | number> | null;
  raw?: Record<string, string> | null;   // 내보낸 행 그대로
}

export interface LogFacts {
  count: number;
  first?: string | null;
  last?: string | null;
  attribute_totals: Record<string, number>;
  by_user: Record<string, number>;
  by_solution?: Record<string, number>;
  by_how?: Record<string, number>;
  by_day: Record<string, number>;
}

export interface LogsPage {
  period: LogPeriod;
  since: string | null;
  until: string | null;
  criteria: Record<string, string>;
  total: number;
  page: number;
  page_size: number;
  facts?: LogFacts | null;
  events: LogEvent[];
  options: { users: string[]; solutions: string[]; how: string[] };
}

// items 는 시스템 안전 점수에만 있습니다.
export interface SafetyScore {
  score: number | null;
  items?: { node: string; level: Level | null; stale: boolean }[];
  trend: { day: string; score: number }[];
}

export interface StatNode {
  node: string;
  grades: { at: string; level: string }[];
  collected: number;
  changed: number;
  trend: string;
  level: Level | null;
  threats: { "위험": number; "주의": number };
}

export interface StatModule {
  module: string;
  "위험": number;
  "주의": number;
  nodes: string[];
  items: string[];
}

export interface Stats {
  period: StatPeriod;
  since: string | null;
  logs: { count: number | null; days: Record<string, number> };
  safety: SafetyScore | null;
  events: { lines: Record<string, number>; days: { day: string; "주의": number; "위험": number }[] };
  servers: { nodes: StatNode[]; modules: StatModule[]; clauses: { source: string; nodes: string[]; items: string[] }[] };
}

export type SuspectLevel = "높음" | "보통" | "낮음";

// 최근 7일을 그 앞 4주와 견준 값입니다.
export interface SuspectSignals {
  subject?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  recent_events?: number;
  baseline_events?: number;
  recent_daily_volume?: number;
  baseline_daily_volume?: number;
  volume_ratio?: number | null;
  off_hours_ratio?: number;
  exception_ratio?: number;
  sensitive_events?: number;
  sensitive_words?: string[];
  max_burst_30min?: number;
  highlights?: string[];
}

export interface HeldAccess {
  request_no: string;
  access: string;
  code?: string | null;
  system?: string | null;
  category?: string | null;
  period_end: string | null;
}

export interface Suspect {
  key: string;
  subject: string;
  log_id: string | null;
  login_id: string | null;
  score: number;
  level: SuspectLevel;
  reason: string;
  watch: string;
  signals: SuspectSignals;
  records: Record<string, number>;
  failed: boolean;
  error: string | null;
  created_at: string;
  trend: { at: string; score: number }[];
  held: HeldAccess[] | null;   // 계정 미연결이면 null
}

export interface UserStats {
  period: StatPeriod;
  since: string | null;
  events: { users: { user: string; log_id: string; "주의": number; "위험": number; lines: number; last_at: string; keys: string[] }[] };
  requests: { total: number; ai: Record<string, number>; mismatches: number };
  suspects: Suspect[];
  safety: SafetyScore | null;
}
