import type { QueueItem } from "@/app/queue/types";
import { ROLE_VIEWS, VIEWS, isAdminView } from "@/app/session/views";
import type { Role, UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { ROLE_ICON, ROLE_LABEL } from "@/shared/lib/labels";
import { today } from "@/shared/lib/request";

// 시스템 역할로 쓸 수 있는 SentinelAI 메뉴 — 업무 권한(지금 가진 권한)과 따로 보임
export function roleMenus(role: Role): string[] {
  const views = ROLE_VIEWS[role];
  const out = views.filter((v) => !isAdminView(v)).map((v) => (v === "requests" ? (role === "top" ? "최종 결재" : "1차 결재") : VIEWS[v].label));
  if (views.some(isAdminView)) out.push("관리");
  if (role === "manager") out.push("계정, 역할 관리");
  return out;
}

// 목록 한 줄 — 부서 아래 직무, 역할은 배지 칸에 따로 둠
export const userItem = (u: UserRow, day: string = today()): QueueItem => ({
  type: "user", key: `user:${u.id}`, id: u.login_id, badge: { icon: ROLE_ICON[u.role], text: ROLE_LABEL[u.role] },
  who: `${u.display_name} (${u.login_id})`, what: u.department || "부서 없음", note: u.job || undefined, when: stamp(u.last_login_at) || "—",
  judge: !u.is_active ? "정지" : u.locked_until && new Date(u.locked_until) > new Date() ? "잠김" : "활성",
  sub: [u.left_on && u.left_on <= day ? `${u.left_on} 퇴사` : "", u.must_change_password ? "비밀번호 변경 전" : ""].filter(Boolean).join(", "), raw: u,
});
