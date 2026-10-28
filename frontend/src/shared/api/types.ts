// 서버 응답의 모양 — 서버는 dict 를 돌려주므로 화면이 쓰는 칸만 적습니다 (FRONTEND_GUIDE §4).

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
  revocation?: Revocation | null;
}

export interface AccessItem {
  code: string;
  name: string;
  system: string | null;
  category: string | null;
  description: string | null;
  is_active: boolean;
  updated_at: string | null;
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
}

export interface PolicyRow {
  policy_id: string;
  solution: string;
  source: string;
  destination: string;
  service: string;
  action: string;
  expires_at: string | null;
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

// 수집 노드가 읽어 온 모듈 상태 — 모듈별 사실(키 · 값)과 직전 수집과 달라진 설정.
export interface Snapshot {
  collected_at?: string | null;
  collected_by?: string | null;
  modules?: Record<string, Record<string, string>>;
  changes?: string[];
}

// 서버 점검의 "정책과 다른 곳" 한 곳 — 지금 · 기준 · 바꿀 것 · 근거 조항.
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
  recommendation?: string | null;   // 10/14 전 결과에만 있음 — 있으면 예전 칸으로 보입니다
  sources?: string[];
  gaps: ServerGap[];
  unjudged: string[];
  failed?: boolean;
  detail?: { state?: Record<string, string | null>; snapshot?: Snapshot | null; matched?: string };
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
}

export interface Results {
  summary: { failed: number } & Partial<Record<Level, number>>;
  sections: Record<string, Section | null>;
  policies: PolicyRow[];
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
  fast?: { every_min: number; next_at: string | null; last: Record<string, { finished_at?: string | null }> };
}

export type AskKind = "policy" | "servers" | "logs";

export interface AskAnswer {
  answer: string;
  sources?: string[];
  criteria?: Record<string, unknown>;
  facts?: Record<string, unknown>;
  evidence?: Record<string, unknown>[];
  failed?: boolean;
}

export interface QaRecord extends AskAnswer {
  id?: number;
  question: string;
  asked_at?: string;
}

export type LogPeriod = "day" | "week" | "month" | "quarter" | "half" | "year" | "all";
export type StatPeriod = "week" | "month" | "quarter" | "all";

export interface LogsParams {
  period: LogPeriod;
  user: string;
  solution: string;
  how: string;
  page: number;
}

// 노드 · 로그 · 통계 응답은 그 화면을 옮길 때 칸을 채웁니다.
export type NodeRow = Record<string, unknown> & { name: string; enabled: boolean };
export type NodeDetail = Record<string, unknown> & { name: string };
export type LogsPage = Record<string, unknown> & { options: Record<string, string[]> };
export type Stats = Record<string, unknown>;
export type UserStats = Record<string, unknown>;
