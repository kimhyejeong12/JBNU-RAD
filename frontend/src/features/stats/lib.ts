import { useQuery } from "@tanstack/react-query";
import type { StatKind, StatSelection } from "@/app/ui/state/uiReducer";
import { useUi } from "@/app/ui/state/UiContext";
import type { Level, SafetyDay, StatNode, Stats, SuspectLevel, Suspect, UserStats } from "@/shared/api/types";
import { statsQuery, userStatsQuery } from "@/shared/api/queries";

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

// 의심 점수 표의 로그 감시 판정 — 고른 기간 안 판정이라 위협 사용자 타일과 숫자가 맞음 (35일 기록은 패널)
export function periodVerdicts(d: UserStats, p: Suspect): string {
  const u = p.log_id ? d.events.users.find((x) => x.log_id === p.log_id) : undefined;
  if (!u) return "";
  return ([["위험", u["위험"]], ["주의", u["주의"]]] as [string, number][]).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ");
}

export const statChart = "px-4.5 pt-1 pb-1.5";

// 두 탭이 받는 것 — 고른 표 줄(오른쪽 패널)과 고른 머리 줄(표 거르기, 다시 누르면 풂)
export interface StatView { selected: StatSelection | null; onSelect: (kind: string, key: string) => void; pick: string | null; onPick: (k: string) => void }

// 안전 점수 옆 글 — 첫 날보다 몇 점 바뀌었는지
export function scoreDelta(trend: SafetyDay[] | null | undefined): string {
  const t = trend ?? [];
  if (t.length < 2) return "흐름은 이틀 이상 쌓이면 보입니다";
  const diff = t[t.length - 1].score - t[0].score;
  const from = t[0].day.slice(5);
  // 날짜의 - 와 헷갈리지 않게 +, - 대신 표의 점수 변화와 같은 ▲▼ 를 씀
  return diff ? `${from}보다 ${diff > 0 ? "▲" : "▼"}${Math.abs(diff)}점` : `${from}부터 변화 없음`;
}

// 사용자 탭 머리 줄 — 의심 높음 · 보통, 위협 사용자(기간 안 로그 감시 주의 이상 판정을 받은 로그 사용자)
export type UserPick = "높음" | "보통" | "events";
export function suspectRows(d: UserStats, pick: string | null): Suspect[] {
  const sus = d.suspects ?? [];
  if (pick === "events") {
    const ids = new Set(d.events.users.map((u) => u.log_id));
    return sus.filter((p) => !!p.log_id && ids.has(p.log_id));
  }
  return pick ? sus.filter((p) => !p.failed && p.level === pick) : sus;
}

// 노드 표 한 줄 — 켜 둔 노드(지금 등급 · 끊김)와 기간 안 점검을 합침. 기간 안 점검이 없으면 stat 이 없음
export interface NodeLine { node: string; level: Level | null; stale: boolean; stat?: StatNode }
export function nodeLines(d: Stats): NodeLine[] {
  const items = d.safety?.items ?? [];
  const names = [...new Set([...items.map((i) => i.node), ...d.servers.nodes.map((n) => n.node)])];
  return names.map((node) => {
    const now = items.find((i) => i.node === node);
    const stat = d.servers.nodes.find((n) => n.node === node);
    return { node, level: now ? now.level : stat?.level ?? null, stale: !!now?.stale, stat };
  });
}

// 시스템 탭 머리 줄 — 위험 · 주의 노드, 끊기거나 판정이 없는 노드
export type NodePick = "위험" | "주의" | "none";
export const pickNodes = (lines: NodeLine[], pick: string | null): NodeLine[] =>
  !pick ? lines : pick === "none" ? lines.filter((l) => l.stale || !l.level) : lines.filter((l) => l.level === pick);

export function useStatsData() {
  const { ui } = useUi();
  const kind = ui.stats.kind ?? "stats";
  const period = ui.stats.period;
  const sys = useQuery({ ...statsQuery(period), enabled: kind === "stats" });
  const usr = useQuery({ ...userStatsQuery(period), enabled: kind === "ustats" });
  return { kind, period, sys, usr };
}
