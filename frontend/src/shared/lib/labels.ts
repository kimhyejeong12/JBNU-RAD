import type { Role, Level } from "@/shared/api/types";

export const ROLE_LABEL: Record<Role, string> = { top: "보안 총책임자", manager: "보안 운영자", user: "일반 사용자" };
export const MODULE_LABEL: Record<string, string> = { ufw: "UFW", sshd: "SSH", pam: "PAM", accounts: "계정, sudo" };

export const LEVELS: readonly Level[] = ["정상", "주의", "위험"];
export const LEVEL_ICON: Record<Level, string> = { "정상": "ok", "주의": "warn", "위험": "bad" };

export const LEVEL_TIP: Record<Level, string> = {
  "정상": "승인 권고",
  "주의": "추가 검토",
  "위험": "반려 권고",
};
