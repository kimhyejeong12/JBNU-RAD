import type { QueueItem } from "@/app/queue/types";
import type { RequestRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { STAGE_LABEL, isActive, requester } from "@/shared/lib/request";

// 결재자가 보는 신청 — AI 판정이 없거나 실패한 신청도 깨지지 않게 글자로 적습니다.
export function requestItem(r: RequestRow): QueueItem {
  const v = r.ai_verdict;
  const level = v && !v.failed ? v.level : undefined;
  return {
    type: "req", key: `req:${r.request_no}`, id: r.request_no, level,
    who: requester(r),
    what: r.requested_access,
    when: stamp(r.submitted_at),
    judge: level || (r.judging ? "판정 중" : v && v.failed ? "판정 실패" : "판정 대기"),
    sub: r.stage === "approved" && !isActive(r) ? "승인 · 기간 끝" : STAGE_LABEL[r.stage],
    raw: r,
  };
}

// 일반 사용자의 내 신청 — AI 칸이 없고 번호를 분류 칸에 둡니다.
export const mineItem = (r: RequestRow): QueueItem => ({
  type: "mine", key: `mine:${r.request_no}`, id: "", typeLabel: r.request_no,
  who: r.requested_access, what: r.reason || "—", when: stamp(r.submitted_at),
  judge: STAGE_LABEL[r.stage], raw: r,
});
