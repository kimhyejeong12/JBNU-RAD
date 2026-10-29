import type { QueueItem } from "@/app/queue/types";
import type { UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { ROLE_LABEL } from "@/shared/lib/labels";

// 계정 목록 한 줄 — 상태는 정지 · 잠김(로그인 실패 잠금이 남아 있음) · 활성.
export const userItem = (u: UserRow): QueueItem => ({
  type: "user", key: `user:${u.id}`, id: u.login_id, typeLabel: ROLE_LABEL[u.role] + (u.is_root ? " · 루트" : ""),
  who: `${u.display_name} (${u.login_id})`, what: u.department || "부서 없음", when: stamp(u.last_login_at) || "—",
  judge: !u.is_active ? "정지" : u.locked_until && new Date(u.locked_until) > new Date() ? "잠김" : "활성",
  sub: u.must_change_password ? "비밀번호 변경 전" : "", raw: u,
});
