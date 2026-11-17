import type { Level, RiskFlag, RiskPerson, WatchPerson } from "@/shared/api/types";

// 권한 변동 한 사람 — /api/risk-people 에 퇴사(/api/people)를 더해 씁니다.
export type Flag = Omit<RiskFlag, "kind"> & { kind: RiskFlag["kind"] | "leave" };
export type Person = Omit<RiskPerson, "flags"> & { flags: Flag[] };

export const KIND: Record<Flag["kind"], string> = {
  move: "부서 이동", grant: "보유 권한", expired: "만료 권한", event: "로그 감시", leave: "퇴사",
};

const RANK: Record<Level, number> = { "위험": 2, "주의": 1, "정상": 0 };
const top = (flags: Flag[], base: Level): Level => flags.reduce<Level>((l, f) => (RANK[f.level] > RANK[l] ? f.level : l), base);

// /api/people 에서 퇴사만 붙입니다 — 나머지(이동 · 재검토 · 신청)는 권한 변동이나 권한 신청 탭에 이미 있습니다.
export function mergeWatch(risk: RiskPerson[], watch: WatchPerson[]): Person[] {
  const out = new Map<number, Person>(risk.map((p) => [p.id, { ...p, flags: [...p.flags] }]));
  for (const w of watch) {
    const extra = w.flags.filter((f) => f.kind === "leave") as Flag[];
    if (!extra.length) continue;
    const p = out.get(w.id) ?? { ...w, flags: [], log_id: "", log_user: "" };
    const flags = [...p.flags, ...extra].sort((a, b) => RANK[b.level] - RANK[a.level]);
    out.set(w.id, { ...p, flags, level: top(flags, p.level) });
  }
  return [...out.values()].sort((a, b) => RANK[b.level] - RANK[a.level]);
}

export interface RiskSummary { danger: number; caution: number; moved: number; grants: number; events: number; expired: number; left: number }

// 위에 보이는 숫자 — 모두 사람 수입니다.
export function summarize(people: Person[]): RiskSummary {
  const count = (ok: (f: Flag) => boolean) => people.filter((p) => p.flags.some(ok)).length;
  return {
    danger: people.filter((p) => p.level === "위험").length,
    caution: people.filter((p) => p.level === "주의").length,
    moved: count((f) => f.kind === "move"),
    grants: count((f) => f.kind === "grant" && f.level !== "정상"),
    events: count((f) => f.kind === "event"),
    expired: count((f) => f.kind === "expired"),
    left: count((f) => f.kind === "leave"),
  };
}

// 사람마다 지금 처지 한 줄입니다.
export function status(p: Person): string {
  const move = p.flags.find((f) => f.kind === "move");
  const expired = p.flags.filter((f) => f.kind === "expired").length;
  return [p.flags.some((f) => f.kind === "leave") && `퇴사 ${p.left_on}`, move && `부서 이동 ${move.at}`, expired && `만료 권한 ${expired}건`].filter(Boolean).join(", ");
}

// 회수할 수 있는 줄과 미리 채울 사유 — 사람이 확인한 뒤에만 회수합니다.
export function revokeReason(f: Flag): string | null {
  if (!f.request_no) return null;
  if (f.kind === "expired") return `사용 기간 만료 (${f.at})`;
  // 재검토 대기 · 실패는 아직 판정이 없어 회수를 권하지 않습니다.
  if (f.kind === "grant" && f.text.includes("이동 뒤 재검토")) return "부서 이동 뒤 업무에 맞지 않는 권한";
  return null;
}

// 타일 다섯 개 — 위험한 사람, 또는 걸린 까닭 하나로 거릅니다.
export type Pick = "danger" | "moved" | "events" | "expired" | "left";
const PICK_KIND: Record<Exclude<Pick, "danger">, Flag["kind"]> = { moved: "move", events: "event", expired: "expired", left: "leave" };

export function pickPeople(people: Person[], pick: Pick | null): Person[] {
  if (!pick) return people;
  if (pick === "danger") return people.filter((p) => p.level === "위험");
  return people.filter((p) => p.flags.some((f) => f.kind === PICK_KIND[pick]));
}
