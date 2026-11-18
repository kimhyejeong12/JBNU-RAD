import { useQueue } from "@/app/queue/useQueue";
import { useUi } from "@/app/ui/state/UiContext";
import type { Briefing, Overview, OverviewArea, Todo } from "@/shared/api/types";


export const AREA_COLOR: Record<OverviewArea, string> = {
  policy: "var(--color-area-policy)", server: "var(--color-area-server)", event: "var(--color-area-event)",
  suspect: "var(--color-area-suspect)", grant: "var(--color-area-grant)",
};

// 표 유형 칸 기호 — 등급 기호(warn · bad)와 안 헷갈리는 메뉴 기호
export const AREA_ICON: Record<OverviewArea, string> = { policy: "book", server: "server", event: "eye", suspect: "users", grant: "key" };

// 항목 key 로 갈 곳을 정함 — 화면이 바로 열 수 있는 것만
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

// 영역마다 열린 위험 · 주의 수를 원 둘레 비율로 — 0 인 영역은 그리지 않음
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

// 표 제목의 건수 — 보이는 줄보다 많으면 "11건 중 10건"
export const ofText = (total: number, shown: number): string => (total > shown ? `${total}건 중 ${shown}건` : `${total}건`);

export const rateText = (rate: number | null): string => (rate == null ? "—" : `${rate}%`);

// 어제 끝과 지금의 차이 — 추이가 이틀이 안 되면 견줄 날이 없어 null 임
export function delta(trend: Overview["trend"], level: "위험" | "주의"): number | null {
  if (trend.length < 2) return null;
  return trend[trend.length - 1][level] - trend[trend.length - 2][level];
}

export const deltaText = (n: number | null): string => (n == null ? "어제 기록 없음" : n === 0 ? "어제와 동일" : `어제보다 ${n > 0 ? "+" : ""}${n}`);

export type FirstTodo = Todo & { area: OverviewArea; label: string };

// 영역마다 맨 앞 할 일 하나씩, 위험부터 n 개 — 종합 대시보드의 AI 요약은 먼저 볼 것만 보임
export function firstTodos(b: Briefing, n = 3): FirstTodo[] {
  const firsts = b.areas.flatMap((a) => a.todos.slice(0, 1).map((t) => ({ ...t, area: a.area, label: a.label })));
  return firsts.sort((x, y) => Number(y.level === "위험") - Number(x.level === "위험")).slice(0, n);
}


// 항목을 고르면 그 판정을 보는 화면으로 감. 목록에 없는 지난 판정은 메뉴만 엶
export function useGo() {
  const { navigate, select, setMainTab, setStats, openDrawer, gotoActiveGrant } = useUi();
  const items = useQueue();
  return (area: OverviewArea, key: string) => {
    const t = targetOf(area, key);
    if (t.to === "grant") return gotoActiveGrant(t.no);
    if (t.to === "suspect") {
      navigate("stats");
      setMainTab("ustats");
      setStats({ selected: { kind: "suspect", key: t.key } });
      return openDrawer();
    }
    if (t.to === "queue" && items.some((i) => i.key === t.key)) return select(t.key);
    navigate(t.view);
    setMainTab("queue");
  };
}

export type Go = ReturnType<typeof useGo>;
