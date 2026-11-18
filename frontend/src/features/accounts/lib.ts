import type { QueueItem } from "@/app/queue/types";
import type { Role, UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { ROLE_LABEL } from "@/shared/lib/labels";
import { today } from "@/shared/lib/request";

// 역할마다 다른 일만 — 나머지 메뉴(정책 관리, 로그 감시, 보안 현황, 관리)는 보안 운영자와 보안 총책임자가 같음
export const ROLE_DUTY: Record<Role, string> = { user: "권한 신청", manager: "1차 결재, 계정 관리", top: "최종 결재" };

// 목록 한 줄 — 부서 아래 직무, 역할은 셋째 칸
export const userItem = (u: UserRow, day: string = today()): QueueItem => ({
  type: "user", key: `user:${u.id}`, id: u.login_id, kind: ROLE_LABEL[u.role],
  who: `${u.display_name} (${u.login_id})`, what: u.department || "부서 없음", note: u.job || undefined, when: stamp(u.last_login_at) || "—",
  judge: !u.is_active ? "정지" : u.locked_until && new Date(u.locked_until) > new Date() ? "잠김" : "활성",
  sub: [u.left_on && u.left_on <= day ? `${u.left_on} 퇴사` : "", u.must_change_password ? "비밀번호 변경 전" : ""].filter(Boolean).join(", "), raw: u,
});
