import type { WatchFlag, WatchPerson } from "@/shared/api/types";

export const KIND: Record<WatchFlag["kind"], string> = {
  leave: "퇴사", move: "부서 이동", grant: "보유 권한", request: "결재 중 신청", expired: "만료 권한", event: "로그 감시",
};

export interface RiskSummary { danger: number; caution: number; moved: number; grants: number; events: number; expired: number }

// 위에 보이는 숫자 — 모두 사람 수입니다.
export function summarize(people: WatchPerson[]): RiskSummary {
  const count = (ok: (f: WatchFlag) => boolean) => people.filter((p) => p.flags.some(ok)).length;
  return {
    danger: people.filter((p) => p.level === "위험").length,
    caution: people.filter((p) => p.level === "주의").length,
    moved: count((f) => f.kind === "move"),
    grants: count((f) => f.kind === "grant" && f.level !== "정상"),
    events: count((f) => f.kind === "event"),
    expired: count((f) => f.kind === "expired"),
  };
}

// 사람마다 지금 처지 한 줄입니다.
export function status(p: WatchPerson): string {
  const move = p.flags.find((f) => f.kind === "move");
  const expired = p.flags.filter((f) => f.kind === "expired").length;
  return [move && `부서 이동 ${move.at}`, expired && `만료 권한 ${expired}건`].filter(Boolean).join(", ");
}

// 회수할 수 있는 줄과 미리 채울 사유 — 사람이 확인한 뒤에만 회수합니다.
export function revokeReason(f: WatchFlag): string | null {
  if (!f.request_no) return null;
  if (f.kind === "expired") return `사용 기간 만료 (${f.at})`;
  // 재검토 대기 · 실패는 아직 판정이 없어 회수를 권하지 않습니다.
  if (f.kind === "grant" && f.text.includes("이동 뒤 재검토")) return "부서 이동 뒤 업무에 맞지 않는 권한";
  return null;
}

export function filterPeople(people: WatchPerson[], level: WatchPerson["level"] | "전체"): WatchPerson[] {
  return level === "전체" ? people : people.filter((p) => p.level === level);
}
