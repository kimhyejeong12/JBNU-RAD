import type { QueueItem } from "@/app/queue/types";
import type { RequestRow, AccessItem, WatchPerson } from "@/shared/api/types";
import { stamp, person } from "@/shared/lib/format";
import { STAGE_LABEL, isActive, requester, today } from "@/shared/lib/request";
import type { HistoryStep } from "@/shared/ui/base/parts";

export function requestItem(r: RequestRow): QueueItem {
  const v = r.ai_verdict;
  const level = v && !v.failed ? v.level : undefined;
  return {
    type: "req", key: `req:${r.request_no}`, id: r.request_no, level,
    who: requester(r),
    what: r.requested_access,
    when: stamp(r.submitted_at),
    judge: level || (r.judging ? "판정 중" : v && v.failed ? "판정 실패" : "판정 대기"),
    sub: r.stage === "approved" && !isActive(r) ? "만료" : grantNote(r) ?? STAGE_LABEL[r.stage],
    raw: r,
  };
}

export function personItem(p: WatchPerson): QueueItem {
  return {
    type: "person", key: `person:${p.id}`, id: p.login_id, level: p.level,
    who: `${p.department} ${p.name}`.trim() + (p.job ? ` (${p.job})` : ""),
    what: p.flags.map((f) => f.text).join(", "),
    when: p.at,
    judge: p.level,
    sub: `${p.flags.length}건${!p.is_active ? " (정지)" : ""}`,
    raw: p,
  };
}

// 퇴사는 코드가 바로 위험, 이동은 AI 판정입니다.
export function grantNote(r: RequestRow): string | undefined {
  const g = r.grant_review;
  if (!g) return undefined;
  const v = g.verdict;
  const state = v ? (v.failed ? "판정 실패" : v.level) : g.judging ? "판정 중" : "판정 대기";
  return `${g.cause === "leave" ? "퇴사" : "이동"} 재검토 ${state}`;
}

// 예: 2026-11-03 보안팀(보안 관제) → 인사팀(채용 담당)
export const moveText = (m: { moved_on: string; from_department: string; from_job: string; to_department: string; to_job: string }): string => {
  const side = (d: string, j: string) => `${d || "부서 없음"}${j ? `(${j})` : ""}`;
  return `${m.moved_on} ${side(m.from_department, m.from_job)} → ${side(m.to_department, m.to_job)}`;
};

export type MineGroup = "pending" | "active" | "done";
export function mineGroup(r: RequestRow, on: string = today()): MineGroup {
  if (r.stage === "manager" || r.stage === "top") return "pending";
  return isActive(r, on) ? "active" : "done";
}

export function mineStatus(r: RequestRow, on: string = today()): string {
  if (r.stage !== "approved") return STAGE_LABEL[r.stage];
  if (!isActive(r, on)) return "만료";
  return r.period_end ? `${shortDate(r.period_end, on)}까지` : "사용 중";
}

export function shortDate(day: string, on: string = today()): string {
  const [y, m, d] = day.split("-");
  return y === on.slice(0, 4) ? `${Number(m)}/${Number(d)}` : day;
}

export function rejectNote(r: RequestRow): string | undefined {
  if (r.stage !== "rejected") return undefined;
  const a = [...(r.approvals ?? [])].reverse().find((x) => x.action === "reject");
  if (!a) return undefined;
  return `${a.step === "manager" ? "1차" : "최종"} 반려: ${a.comment || "의견 없음"}`;
}

// 신청자는 1차 결재 전에만 철회합니다 (서버도 같은 조건으로 막습니다).
export const canWithdraw = (r: RequestRow): boolean => r.stage === "manager";

export interface AccessOptions {
  items: AccessItem[];              // 켜진 권한 — 시스템 순
  reason: Record<string, string>;   // 고를 수 없는 권한의 이유 (보유 중 + 기간 · 결재 중)
  value: string;                    // 앞 선택이 막히지 않았으면 그대로
  empty: boolean;
}

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

export function heldLabel(periodEnd: string | null, on: string = today()): string {
  return periodEnd ? `보유 중 (${shortDate(periodEnd, on)}까지)` : "보유 중";
}

export function approvalSteps(r: RequestRow): HistoryStep[] {
  const steps: HistoryStep[] = (r.approvals ?? []).map((a) => ({
    title: `${a.step === "manager" ? "1차" : "최종"} ${a.action === "approve" ? "승인" : "반려"}`,
    who: person(a.approver_name, a.approver_department),
    when: stamp(a.decided_at),
    say: a.comment,
  }));
  if (r.revocation) {
    steps.push({ title: "회수", who: person(r.revocation.revoker_name, r.revocation.revoker_department), when: stamp(r.revocation.revoked_at), say: r.revocation.reason });
  }
  return steps;
}
