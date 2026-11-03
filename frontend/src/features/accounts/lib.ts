import type { QueueItem } from "@/app/queue/types";
import type { UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { ROLE_LABEL } from "@/shared/lib/labels";
import { today } from "@/shared/lib/request";

// 계정 목록 한 줄 — 상태는 정지 · 잠김(로그인 실패 잠금이 남아 있음) · 활성. 퇴사일이 지났으면 아래 줄에 퇴사.
export const userItem = (u: UserRow, day: string = today()): QueueItem => ({
  type: "user", key: `user:${u.id}`, id: u.login_id, typeLabel: ROLE_LABEL[u.role] + (u.is_root ? " · 루트" : ""),
  who: `${u.display_name} (${u.login_id})`, what: [u.department || "부서 없음", u.job].filter(Boolean).join(" · "), when: stamp(u.last_login_at) || "—",
  judge: !u.is_active ? "정지" : u.locked_until && new Date(u.locked_until) > new Date() ? "잠김" : "활성",
  sub: [u.left_on && u.left_on <= day ? `${u.left_on} 퇴사` : "", u.must_change_password ? "비밀번호 변경 전" : ""].filter(Boolean).join(" · "), raw: u,
});
