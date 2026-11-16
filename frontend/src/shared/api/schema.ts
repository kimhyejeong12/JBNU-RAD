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

export interface AskRequest {
  question: string;
  conversation_id?: string | null;
}

/** 변경 이력의 한 줄 — detail 은 기록마다 칸이 다릅니다 (사유 또는 바뀐 칸과 값). */
export interface AuditRow {
  id: number;
  at: string;
  action: string;
  by: string;
  detail: Record<string, unknown>;
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

export interface HTTPValidationError {
  detail?: ValidationError[];
}

export interface LoginBody {
  login_id: string;
  password: string;
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

export interface PasswordBody {
  current: string;
  new: string;
}

export interface PasswordReset {
  temporary_password: string;
}

/** 기준 문서 한 개 — 원문과 고친 시각. */
export interface Regulation {
  name: string;
  content: string;
  updated_at: string;
}

export interface RemoveRegulation {
  reason: string;
}

export interface ResetJobs {
  rerun?: boolean;
}

export interface ReviewDecision {
  kind: string;
  item_key: string;
  action: string;
  subject?: string;
  comment?: string;
  ai_level?: string | null;
}

export interface RevokeBody {
  reason: string;
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

export interface ValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

/** 확인할 사람에게 걸린 일 하나 — 퇴사 · 이동 · 보유 권한 · 결재 중 신청. */
export interface WatchFlag {
  kind: "leave" | "move" | "grant" | "request";
  level: "정상" | "주의" | "위험";
  at: string;
  text: string;
  request_no?: string | null;
}

/** 확인할 사람 한 명 — level · at 은 걸린 일 중 가장 높은 등급 · 가장 늦은 날. */
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
