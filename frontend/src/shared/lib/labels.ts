import type { AuditRow, Role, Level } from "@/shared/api/types";

export const ROLE_LABEL: Record<Role, string> = { top: "보안 총책임자", manager: "보안 운영자", user: "일반 사용자" };
export const MODULE_LABEL: Record<string, string> = { ufw: "UFW", sshd: "SSH", pam: "PAM", accounts: "계정, sudo" };

export const LEVELS: readonly Level[] = ["정상", "주의", "위험"];
export const LEVEL_ICON: Record<Level, string> = { "정상": "ok", "주의": "warn", "위험": "bad" };

export const LEVEL_TIP: Record<Level, string> = {
  "정상": "승인 권고",
  "주의": "추가 검토",
  "위험": "반려 권고",
};

// 변경 이력(감사 기록)에 쓰는 말입니다.
export const AUDIT_ACTION: Record<string, string> = {
  regulation_upload: "올림", regulation_edit: "고침", regulation_remove: "지움",
  user_create: "만듦", root_create: "만듦", user_update: "고침", password_reset: "비밀번호 초기화",
  access_create: "등록", access_update: "고침",
};
const FIELD: Record<string, string> = {
  display_name: "이름", department: "부서", job: "직무", role: "역할", is_active: "상태", log_id: "로그 사용자 ID", left_on: "퇴사일",
  email: "이메일", name: "이름", system: "시스템", category: "분류", description: "설명", login_id: "아이디",
};

function value(key: string, v: unknown): string {
  if (key === "role") return ROLE_LABEL[v as Role] ?? String(v);
  if (key === "is_active") return v ? "켬" : "끔";
  return v === "" || v == null ? "비움" : String(v);
}

// 사유가 있으면 사유를, 없으면 바뀐 칸과 값을 적습니다.
export function changeText(r: AuditRow): string {
  if (typeof r.detail.reason === "string" && r.detail.reason) return r.detail.reason;
  return Object.entries(r.detail).filter(([k]) => k in FIELD).map(([k, v]) => `${FIELD[k]} ${value(k, v)}`).join(", ");
}
