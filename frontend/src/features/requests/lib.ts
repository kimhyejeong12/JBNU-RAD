import type { QueueItem } from "@/app/queue/types";
import type { RequestRow, AccessItem } from "@/shared/api/types";
import { stamp, person } from "@/shared/lib/format";
import { STAGE_LABEL, isActive, requester, today } from "@/shared/lib/request";
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

// 일반 사용자의 내 신청 — AI 칸이 없고 번호를 분류 칸에 둡니다. 반려된 신청은 줄 아래에 반려 의견.
export const mineItem = (r: RequestRow): QueueItem => ({
  type: "mine", key: `mine:${r.request_no}`, id: "", typeLabel: r.request_no,
  who: r.requested_access, what: r.reason || "—", when: stamp(r.submitted_at),
  judge: STAGE_LABEL[r.stage], note: rejectNote(r), raw: r,
});

// 반려 의견 — 신청자가 다시 신청하려면 어느 단계에서 누가 왜 반려했는지 알아야 합니다.
export function rejectNote(r: RequestRow): string | undefined {
  if (r.stage !== "rejected") return undefined;
  const a = [...(r.approvals ?? [])].reverse().find((x) => x.action === "reject");
  if (!a) return undefined;
  return `${a.step === "manager" ? "1차" : "최종"} 반려 · ${person(a.approver_name, a.approver_department)} — ${a.comment || "의견 없음"}`;
}

// 신청자는 1차 결재 전에만 철회합니다 (서버도 같은 조건으로 막습니다).
export const canWithdraw = (r: RequestRow): boolean => r.stage === "manager";

export interface AccessOptions {
  items: AccessItem[];              // 켜진 권한 — 시스템 순 (같은 시스템끼리 붙여 놓음, 시스템이 없으면 기타)
  reason: Record<string, string>;   // 고를 수 없는 권한의 이유 (보유 중 + 기간 · 결재 중)
  value: string;                    // 앞 선택이 막히지 않았으면 그대로
  empty: boolean;                   // 켜진 권한이 하나도 없음
}

// 신청서의 권한 카드 — 권한 목록의 켜진 권한을 시스템 순으로 늘어놓고, 보유 중 · 결재 중인 권한은 막습니다.
export function accessOptions(catalog: AccessItem[], mine: RequestRow[], prev: string): AccessOptions {
  const held = new Map(mine.filter((r) => isActive(r)).map((r) => [r.access_code, r.period_end] as const));
  const pending = new Set(mine.filter((r) => r.stage === "manager" || r.stage === "top").map((r) => r.access_code));
  const active = catalog.filter((a) => a.is_active);
  const sys = (a: AccessItem) => a.system || "기타";
  const order = [...new Set(active.map(sys))];
  const reason: Record<string, string> = {};
  for (const a of active) {
    if (held.has(a.code)) reason[a.code] = heldLabel(held.get(a.code) ?? null);
    else if (pending.has(a.code)) reason[a.code] = "결재 중";
  }
  return {
    items: order.flatMap((s) => active.filter((a) => sys(a) === s)),
    reason,
    value: prev && !held.has(prev) && !pending.has(prev) ? prev : "",
    empty: !active.length,
  };
}

// 보유 중 배지 — 쓸 수 있는 기간을 붙입니다 (신청서에 따로 두던 현재 보유 권한 목록 대신). 올해면 월/일, 다른 해면 날짜 전체, 끝나는 날이 없으면 보유 중만.
export function heldLabel(periodEnd: string | null, on: string = today()): string {
  if (!periodEnd) return "보유 중";
  const [y, m, d] = periodEnd.split("-");
  return `보유 중 · ${y === on.slice(0, 4) ? `${Number(m)}/${Number(d)}` : periodEnd}까지`;
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
