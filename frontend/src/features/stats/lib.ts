import type { StatKind } from "@/app/ui/state/uiReducer";
import type { Level, StatPeriod, SuspectLevel, Suspect } from "@/shared/api/types";

export const STAT_PERIODS: [StatPeriod, string][] = [["week", "일주일"], ["month", "한 달"], ["quarter", "3개월"], ["all", "전체"]];
export const STAT_TITLES: Record<StatKind, string> = { stats: "보안 통계", ustats: "사용자 위협" };

// 의심 등급 → 막대 색 (등급 색을 빌려 씁니다 — 높음 = 위험 색)
export const SUSPECT_COLOR: Record<SuspectLevel, Level> = { "높음": "위험", "보통": "주의", "낮음": "정상" };

// 직전 예측보다 10점 넘게 오르내리면 막대 옆에 화살표로 알립니다.
export function trendMark(trend?: { score: number; at?: string; day?: string }[] | null): string {
  const t = trend || [];
  if (t.length < 2) return "";
  const diff = t[t.length - 1].score - t[t.length - 2].score;
  return diff > 10 ? ` · ▲${diff}` : diff < -10 ? ` · ▼${-diff}` : "";
}

export const safetyTone = (score: number): Level => (score >= 80 ? "정상" : score >= 50 ? "주의" : "위험");

// 위협 로그 빈도의 분모 — 전체 기간이면 첫 로그 날부터 오늘까지.
export function periodDays(period: StatPeriod, days: Record<string, number>, now: number = Date.now()): number {
  if (period !== "all") return { week: 7, month: 30, quarter: 90 }[period];
  const keys = Object.keys(days).sort();
  return keys.length ? Math.max(1, Math.round((now - new Date(keys[0]).getTime()) / 86400000)) : 0;
}

export interface DayCount { "위험": number; "주의": number; total: number }

// 날짜별 — 위험 · 주의 · 그 외 로그를 쌓은 세로 막대. 높이 = 그날 로그 건수(빈도), 색 조각 = 위협 비율.
export function mergeDays(logDays: Record<string, number>, eventDays: { day: string; "주의": number; "위험": number }[]): { keys: string[]; byDay: Record<string, DayCount> } {
  const byDay: Record<string, DayCount> = {};
  for (const [day, n] of Object.entries(logDays)) byDay[day] = { "위험": 0, "주의": 0, total: n };
  for (const x of eventDays) byDay[x.day] = { ...(byDay[x.day] || { total: 0 }), "위험": x["위험"], "주의": x["주의"] } as DayCount;
  return { keys: Object.keys(byDay).sort(), byDay };
}

// 사람마다 35일 안 로그 감시 판정 수.
export function verdictsText(p: Suspect): string {
  const r = p.records || {};
  return ([["위험", r["로그 위험"]], ["주의", r["로그 주의"]]] as [string, number | undefined][])
    .filter(([, n]) => n).map(([k, n]) => `${k} 판정 ${n}`).join(" · ");
}
