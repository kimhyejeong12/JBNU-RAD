import type { QueueItem } from "@/app/queue/types";
import type { RequestRow, AccessItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { STAGE_LABEL, isActive, requester, stageGroup, today } from "@/shared/lib/request";

export function requestItem(r: RequestRow): QueueItem {
  const v = r.ai_verdict;
  const level = (v && !v.failed && v.level) || undefined;
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

// 퇴사는 코드가 바로 위험, 이동은 AI 판정임
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

// 신청자는 1차 결재 전에만 철회함 (서버도 같은 조건으로 막음)
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

// 사용 기간 — 끝나는 날을 고르거나 기한 없음을 눌러야 하고, 끝이 시작보다 앞설 수 없음. 문제가 없으면 null
export function periodProblem(start: string, end: string, open: boolean): string | null {
  if (open) return null;
  if (!end) return "사용 종료일을 고르거나 기한 없음을 누르세요";
  if (start && end < start) return "사용 종료일이 시작일보다 앞섭니다";
  return null;
}

// 끝난 신청(반려 · 만료 등)의 내역 — "반려 1, 만료 2" 처럼 0 이 아닌 것만, 없으면 빈 글
export function endedBreakdown(mine: RequestRow[], on: string = today()): string {
  const n = { 반려: 0, 만료: 0, 회수: 0, 철회: 0 };
  for (const r of mine) {
    if (stageGroup(r, on) !== "done") continue;
    if (r.stage === "rejected") n.반려 += 1;
    else if (r.stage === "revoked") n.회수 += 1;
    else if (r.stage === "withdrawn") n.철회 += 1;
    else n.만료 += 1;
  }
  return Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ");
}

// 내 신청 표의 기간 한 줄 — 빈 종료일은 기한 없음임
export function periodText(r: Pick<RequestRow, "period_start" | "period_end">): string {
  if (r.period_end) return r.period_start ? `${r.period_start} ~ ${r.period_end}` : `${r.period_end}까지`;
  return r.period_start ? `${r.period_start}부터, 기한 없음` : "기한 없음";
}

export function heldLabel(periodEnd: string | null, on: string = today()): string {
  return periodEnd ? `보유 중 (${shortDate(periodEnd, on)}까지)` : "보유 중";
}

export type FlowState = "done" | "rejected" | "current" | "idle" | "stopped";
export interface FlowStep { label: string; who: string; state: FlowState }
export interface FlowNote { label: string; text: string; alert: boolean }

// 결재 단계 표시 — 신청 · 1차 · 최종 세 칸에 이름만, 의견 · 사유 · 만료는 아래 줄로
export function approvalFlow(r: RequestRow, on: string = today()): { steps: FlowStep[]; notes: FlowNote[] } {
  const step = (s: "manager" | "top", name: string): FlowStep => {
    const a = r.approvals?.find((x) => x.step === s);
    if (a) return { label: `${name} ${a.action === "approve" ? "승인" : "반려"}`, who: a.approver_name, state: a.action === "approve" ? "done" : "rejected" };
    return { label: `${name} 결재`, who: "", state: r.stage === s ? "current" : "idle" };
  };
  const steps: FlowStep[] = [
    { label: r.stage === "withdrawn" ? "철회" : "신청 완료", who: r.requester_name, state: r.stage === "withdrawn" ? "stopped" : "done" },
    step("manager", "1차"),
    step("top", "최종"),
  ];
  const notes: FlowNote[] = (r.approvals ?? []).filter((a) => a.comment).map((a) => ({
    label: `${a.step === "manager" ? "1차" : "최종"} ${a.action === "approve" ? "의견" : "반려 의견"}`, text: a.comment, alert: a.action === "reject",
  }));
  if (r.revocation) notes.push({ label: "회수", text: `${r.revocation.reason} (${r.revocation.revoker_name})`, alert: true });
  else if (r.stage === "approved" && !isActive(r, on)) notes.push({ label: "만료", text: `사용 기간 끝 ${r.period_end}`, alert: true });
  return { steps, notes };
}
