import type { AuditRow, Role, Level, StatPeriod } from "@/shared/api/types";

export const ROLE_LABEL: Record<Role, string> = { top: "보안 총책임자", manager: "보안 운영자", user: "일반 사용자" };
export const MODULE_LABEL: Record<string, string> = { ufw: "UFW", sshd: "SSH", pam: "PAM", accounts: "계정, sudo" };

export const STAT_PERIODS: [StatPeriod, string][] = [["week", "일주일"], ["month", "한 달"], ["quarter", "3개월"], ["all", "전체"]];

export const LEVELS: readonly Level[] = ["정상", "주의", "위험"];
export const LEVEL_ICON: Record<Level, string> = { "정상": "ok", "주의": "warn", "위험": "bad" };

export const LEVEL_TIP: Record<Level, string> = {
  "정상": "승인 권고",
  "주의": "추가 검토",
  "위험": "반려 권고",
};

// 변경 이력(감사 기록)에 쓰는 말임
export const AUDIT_ACTION: Record<string, string> = {
  regulation_upload: "업로드", regulation_edit: "수정", regulation_remove: "삭제",
  user_create: "생성", root_create: "생성", user_update: "수정", password_reset: "비밀번호 초기화",
  access_create: "등록", access_update: "수정",
};
const FIELD: Record<string, string> = {
  display_name: "이름", department: "부서", job: "직무", role: "역할", is_active: "상태", log_id: "로그 사용자 ID", left_on: "퇴사일",
  email: "이메일", name: "이름", system: "시스템", category: "분류", description: "설명", login_id: "아이디",
};

function value(key: string, v: unknown): string {
  if (key === "role") return ROLE_LABEL[v as Role] ?? String(v);
  if (key === "is_active") return v ? "활성" : "비활성";
  return v === "" || v == null ? "빈 값" : String(v);
}

// 바뀌기 전 값 — 바뀐 칸만 남긴 기록에만 있음 (예전 기록은 저장 때 보낸 칸 전부)
const before = (r: AuditRow): Record<string, unknown> | null =>
  r.detail.from && typeof r.detail.from === "object" ? r.detail.from as Record<string, unknown> : null;

// 사유가 있으면 사유를, 없으면 바뀐 칸과 값("부서 빈 값 → 인사팀")을 적음
export function changeText(r: AuditRow): string {
  if (typeof r.detail.reason === "string" && r.detail.reason) return r.detail.reason;
  const from = before(r);
  return Object.entries(r.detail).filter(([k]) => k in FIELD)
    .map(([k, v]) => (from && k in from ? `${FIELD[k]} ${value(k, from[k])} → ${value(k, v)}` : `${FIELD[k]} ${value(k, v)}`)).join(", ");
}

// 최근 변경 줄의 짧은 글 — 바뀐 칸 이름만, 알 수 없으면 동작 이름과 사유(기준 문서)
export function changeSummary(r: AuditRow): string {
  const keys = Object.keys(before(r) ?? {}).filter((k) => k in FIELD);
  if (keys.length) return keys.map((k) => FIELD[k]).join(", ");
  const reason = typeof r.detail.reason === "string" ? r.detail.reason : "";
  return [AUDIT_ACTION[r.action] ?? r.action, reason].filter(Boolean).join(", ");
}
