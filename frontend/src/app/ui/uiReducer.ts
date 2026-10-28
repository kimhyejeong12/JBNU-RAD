import type { Level, LogPeriod, StatPeriod } from "@/shared/api/types";
import { VIEWS, type MainTab, type View } from "@/app/views";

// 화면(UI) 상태 — 서버 데이터는 TanStack Query 에 있고, 여기에는 어느 메뉴 · 탭 · 항목을 보고 있는지만 둡니다.

export type StageFilter = "pending" | "active" | "all";
export type StatKind = "stats" | "ustats";
export type LevelFilter = "전체" | Level;
export interface AskSource { i: number; n: number }   // 패널에 띄운 인용 조항 { 질의 순번, sources 순번 }
export interface StatSelection { kind: string; key: string }

export interface UiState {
  view: View | null;
  mainTab: MainTab;
  filter: LevelFilter;
  stageFilter: StageFilter;
  query: string;
  selected: string | null;        // 큐 항목 key
  panelMsg: string;               // 패널 동작 결과 (오류 · 완료)
  expanded: ReadonlySet<string>;  // 펼친 근거 칩
  askSource: AskSource | null;
  drawerOpen: boolean;
  nodes: { selected: string | null; adding: boolean };
  logs: { period: LogPeriod; user: string; solution: string; how: string; page: number; selected: number | null };
  stats: { period: StatPeriod; kind: StatKind | null; selected: StatSelection | null };
}

export const initialUi: UiState = {
  view: null, mainTab: "queue", filter: "전체", stageFilter: "pending", query: "", selected: null, panelMsg: "",
  expanded: new Set(), askSource: null, drawerOpen: false,
  nodes: { selected: null, adding: false },
  logs: { period: "week", user: "", solution: "", how: "", page: 1, selected: null },
  stats: { period: "month", kind: null, selected: null },
};

export type UiAction =
  | { type: "NAVIGATE"; view: View; nextSelected: string | null }
  | { type: "SET_MAIN_TAB"; tab: MainTab }
  | { type: "SELECT"; key: string; view: View }
  | { type: "SELECT_SILENT"; key: string | null }
  | { type: "DESELECT" }
  | { type: "TOGGLE_FILTER"; level: Level }
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_STAGE_FILTER"; value: StageFilter; nextSelected: string | null }
  | { type: "SET_PANEL_MSG"; msg: string }
  | { type: "TOGGLE_CHIP"; key: string }
  | { type: "OPEN_DRAWER" }
  | { type: "CLOSE_DRAWER" }
  | { type: "CLOSE_PANEL" }
  | { type: "OPEN_LOGS"; cond: Partial<UiState["logs"]> }
  | { type: "PICK_NODE"; name: string | null }
  | { type: "ADD_NODE" }
  | { type: "SET_LOGS"; patch: Partial<UiState["logs"]> }
  | { type: "SET_STATS"; patch: Partial<UiState["stats"]> }
  | { type: "SET_ASK_SOURCE"; src: AskSource | null };

const isStatTab = (t: MainTab): t is StatKind => t === "stats" || t === "ustats";

// 탭을 떠나면 열어 둔 인용 조항도 닫습니다. 통계 종류가 바뀌면 고른 막대를 풉니다.
function withTab(s: UiState, tab: MainTab): UiState {
  const askSource = tab !== s.mainTab ? null : s.askSource;
  const stats = isStatTab(tab) && s.stats.kind !== tab ? { ...s.stats, kind: tab, selected: null } : s.stats;
  return { ...s, mainTab: tab, askSource, stats };
}

// 메뉴가 바뀌면 거르기 · 메시지 · 인용을 초기화합니다. 질의 탭도 메뉴를 따르므로 열어 둔 근거는 다른 질의의 것입니다.
function withView(s: UiState, view: View): UiState {
  if (view === s.view) return s;
  return { ...s, view, filter: "전체", panelMsg: "", askSource: null };
}

export function uiReducer(s: UiState, a: UiAction): UiState {
  switch (a.type) {
    case "NAVIGATE": {
      const tabs = VIEWS[a.view].tabs;
      return { ...withTab(withView(s, a.view), tabs.includes("queue") ? "queue" : tabs[0]), selected: a.nextSelected };
    }
    case "SET_MAIN_TAB":
      return withTab(s, a.tab);
    case "SELECT": {
      const cleared = { ...s, panelMsg: a.key !== s.selected ? "" : s.panelMsg };
      return { ...withTab(withView(cleared, a.view), "queue"), selected: a.key };
    }
    case "SELECT_SILENT":
      return { ...s, selected: a.key };
    case "DESELECT":
      return { ...s, selected: null, panelMsg: "" };
    case "TOGGLE_FILTER":
      return { ...s, filter: s.filter === a.level ? "전체" : a.level };
    case "SET_QUERY":
      return { ...s, query: a.query };
    case "SET_STAGE_FILTER":
      return { ...s, stageFilter: a.value, selected: a.nextSelected };
    case "SET_PANEL_MSG":
      return { ...s, panelMsg: a.msg };
    case "TOGGLE_CHIP": {
      const expanded = new Set(s.expanded);
      if (!expanded.delete(a.key)) expanded.add(a.key);
      return { ...s, expanded };
    }
    case "OPEN_DRAWER":
      return s.drawerOpen ? s : { ...s, drawerOpen: true };
    case "CLOSE_DRAWER":
      return s.drawerOpen ? { ...s, drawerOpen: false } : s;
    case "CLOSE_PANEL": {
      const t = { ...s, drawerOpen: false };
      if (s.mainTab === "nodes") return { ...t, nodes: { selected: null, adding: false } };
      if (s.mainTab === "logs") return { ...t, logs: { ...s.logs, selected: null } };
      if (s.mainTab === "ask") return { ...t, askSource: null };
      return t;
    }
    case "OPEN_LOGS":
      return { ...withTab(s, "logs"), logs: { ...s.logs, user: "", solution: "", how: "", page: 1, ...a.cond, selected: null } };
    case "PICK_NODE":
      return { ...s, panelMsg: "", nodes: { selected: a.name, adding: false } };
    case "ADD_NODE":
      return { ...s, panelMsg: "", nodes: { selected: null, adding: true } };
    case "SET_LOGS":
      return { ...s, logs: { ...s.logs, ...a.patch } };
    case "SET_STATS":
      return { ...s, stats: { ...s.stats, ...a.patch } };
    case "SET_ASK_SOURCE":
      return { ...s, askSource: a.src };
  }
}
