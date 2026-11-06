import type { StatKind } from "@/app/ui/state/uiReducer";
import type { Level, StatPeriod, SuspectLevel, Suspect } from "@/shared/api/types";
import { card } from "@/shared/ui/base/styles";

export const STAT_PERIODS: [StatPeriod, string][] = [["week", "일주일"], ["month", "한 달"], ["quarter", "3개월"], ["all", "전체"]];
export const STAT_TITLES: Record<StatKind, string> = { stats: "시스템", ustats: "사용자" };

export const SUSPECT_COLOR: Record<SuspectLevel, Level> = { "높음": "위험", "보통": "주의", "낮음": "정상" };

export function trendMark(trend?: { score: number; at?: string; day?: string }[] | null): string {
  const t = trend || [];
  if (t.length < 2) return "";
  const diff = t[t.length - 1].score - t[t.length - 2].score;
  return diff > 10 ? ` ▲${diff}` : diff < -10 ? ` ▼${-diff}` : "";
}

export const safetyTone = (score: number): Level => (score >= 80 ? "정상" : score >= 50 ? "주의" : "위험");

export interface DayCount { "위험": number; "주의": number; total: number }

export function mergeDays(logDays: Record<string, number>, eventDays: { day: string; "주의": number; "위험": number }[]): { keys: string[]; byDay: Record<string, DayCount> } {
  const byDay: Record<string, DayCount> = {};
  for (const [day, n] of Object.entries(logDays)) byDay[day] = { "위험": 0, "주의": 0, total: n };
  for (const x of eventDays) byDay[x.day] = { ...(byDay[x.day] || { total: 0 }), "위험": x["위험"], "주의": x["주의"] } as DayCount;
  return { keys: Object.keys(byDay).sort(), byDay };
}

export function verdictsText(p: Suspect): string {
  const r = p.records || {};
  return ([["위험", r["로그 위험"]], ["주의", r["로그 주의"]]] as [string, number | undefined][])
    .filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ");
}

export const statCard = `${card} flex flex-col`;
export const statSub = "m-0 px-4.5 pb-2.5 text-[12.5px] text-ink-dim";
export const statChart = "px-4.5 pt-1 pb-1.5";
export const statLabel = "text-[12px] font-semibold text-ink-dim";
export const statTiles = "grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 px-4.5 pb-4";
export const statSafety = "mx-4.5 mb-3 grid grid-cols-[auto_minmax(0,1fr)_minmax(140px,220px)] items-center gap-4.5 rounded-[10px] border border-line px-4 py-3.5 empty:hidden phone:grid-cols-[auto_minmax(0,1fr)]";
