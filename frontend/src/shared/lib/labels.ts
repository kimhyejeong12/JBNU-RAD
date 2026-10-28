import type { Role } from "@/shared/api/types";

export const ROLE_LABEL: Record<Role, string> = { top: "보안 총책임자", manager: "보안 운영자", user: "일반 사용자" };
export const MODULE_LABEL: Record<string, string> = { ufw: "UFW", sshd: "SSH", pam: "PAM", accounts: "계정 · sudo" };
