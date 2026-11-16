import type { Overview, OverviewArea, StatPeriod } from "@/shared/api/types";

export const PERIODS: [StatPeriod, string][] = [["week", "일주일"], ["month", "한 달"], ["quarter", "3개월"], ["all", "전체"]];

export const AREA_COLOR: Record<OverviewArea, string> = {
  policy: "var(--color-area-policy)", server: "var(--color-area-server)", event: "var(--color-area-event)",
  suspect: "var(--color-area-suspect)", grant: "var(--color-area-grant)",
};

// 항목 key 로 갈 곳을 정합니다 — 화면이 바로 열 수 있는 것만.
export type Target =
  | { to: "queue"; key: string; view: "policies" | "events" }
  | { to: "view"; view: "policies" }
  | { to: "suspect"; key: string }
  | { to: "grant"; no: string };

export function targetOf(area: OverviewArea, key: string): Target {
  if (area === "suspect") return { to: "suspect", key: key.replace(/^suspect\//, "") };
  if (area === "grant") return { to: "grant", no: key.replace(/^grant\//, "") };
  if (area === "event") return { to: "queue", key: `event:${key}`, view: "events" };
  if (area === "server") return { to: "queue", key: `server:${key}`, view: "policies" };
  if (key.startsWith("policy_issues/")) return { to: "queue", key: `policy:${key}`, view: "policies" };
  return { to: "view", view: "policies" };
}

export interface Arc { area: OverviewArea; label: string; value: number; start: number; end: number }

// 영역마다 열린 위험 · 주의 수를 원 둘레 비율로 — 0 인 영역은 그리지 않습니다.
export function arcs(areas: Overview["areas"]): { total: number; arcs: Arc[] } {
  const rows = areas.map((a) => ({ area: a.area, label: a.label, value: a["위험"] + a["주의"] }));
  const total = rows.reduce((n, r) => n + r.value, 0);
  let at = 0;
  const out: Arc[] = [];
  for (const r of rows) {
    if (!r.value) continue;
    const start = at;
    at += r.value / total;
    out.push({ ...r, start, end: at });
  }
  return { total, arcs: out };
}

export const rateText = (rate: number | null): string => (rate == null ? "—" : `${rate}%`);
