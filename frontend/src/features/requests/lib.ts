import type { QueueItem } from "@/app/queue/types";
import type { RequestRow, AccessItem } from "@/shared/api/types";
import { stamp, person } from "@/shared/lib/format";
import { STAGE_LABEL, isActive, requester } from "@/shared/lib/request";
import type { HistoryStep } from "@/shared/ui/base/parts";

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

// 신청자는 1차 결재 전에만 철회합니다 (서버도 같은 조건으로 막습니다).
export const canWithdraw = (r: RequestRow): boolean => r.stage === "manager";

export interface AccessOptions {
  groups: [system: string, items: AccessItem[]][];
  reason: Record<string, string>;   // 고를 수 없는 권한의 이유 (보유 중 · 결재 중)
  value: string;                    // 앞 선택이 막히지 않았으면 그대로
  empty: boolean;                   // 켜진 권한이 하나도 없음
}

// 신청서의 고르기 칸 — 권한 목록의 켜진 권한을 시스템별로 묶고, 보유 중 · 결재 중인 권한은 막습니다.
export function accessOptions(catalog: AccessItem[], mine: RequestRow[], prev: string): AccessOptions {
  const held = new Set(mine.filter((r) => isActive(r)).map((r) => r.access_code));
  const pending = new Set(mine.filter((r) => r.stage === "manager" || r.stage === "top").map((r) => r.access_code));
  const items = catalog.filter((a) => a.is_active);
  const groups = new Map<string, AccessItem[]>();
  const reason: Record<string, string> = {};
  for (const a of items) {
    const sys = a.system || "기타";
    if (!groups.has(sys)) groups.set(sys, []);
    groups.get(sys)!.push(a);
    if (held.has(a.code)) reason[a.code] = "보유 중";
    else if (pending.has(a.code)) reason[a.code] = "결재 중";
  }
  return {
    groups: [...groups],
    reason,
    value: prev && !held.has(prev) && !pending.has(prev) ? prev : "",
    empty: !items.length,
  };
}

// 결재 기록 (결재자 패널) — 1차 · 최종 결재와 회수를 순서대로, 결재 때의 AI 판정과 함께.
export function approvalSteps(r: RequestRow): HistoryStep[] {
  const steps: HistoryStep[] = (r.approvals ?? []).map((a) => ({
    title: `${a.step === "manager" ? "1차" : "최종"} ${a.action === "approve" ? "승인" : "반려"}`,
    who: person(a.approver_name, a.approver_department),
    when: `${stamp(a.decided_at)}${a.ai_level ? ` · 그때 AI 판정 ${a.ai_level}` : ""}`,
    say: a.comment,
  }));
  if (r.revocation) {
    steps.push({ title: "회수", who: person(r.revocation.revoker_name, r.revocation.revoker_department), when: stamp(r.revocation.revoked_at), say: r.revocation.reason });
  }
  return steps;
}
