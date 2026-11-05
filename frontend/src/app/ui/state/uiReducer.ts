import type { Level, LogPeriod, StatPeriod } from "@/shared/api/types";
import { VIEWS, isAdminView, type MainTab, type SavedPage, type View } from "@/app/session/views";

// 서버 데이터는 TanStack Query 에 있고 여기에는 보고 있는 메뉴 · 탭 · 항목만 둡니다.

export const NEW_ITEM = "new";

export type StageFilter = "pending" | "active" | "people" | "all";
export type StatKind = "stats" | "ustats";
export type LevelFilter = "전체" | Level;
export interface AskSource { i: number; n: number }   // 인용 조항 { 질의 순번, sources 순번 }
export interface StatSelection { kind: string; key: string }

export interface UiState {
  view: View | null;
  lastAdmin: View | null;
  mainTab: MainTab;
  filter: LevelFilter;
  stageFilter: StageFilter;
  query: string;
  selected: string | null;
  panelMsg: string;
  expanded: ReadonlySet<string>;
  askSource: AskSource | null;
  drawerOpen: boolean;
  nodes: { selected: string | null; adding: boolean };
  logs: { period: LogPeriod; user: string; solution: string; how: string; page: number; selected: number | null };
  stats: { period: StatPeriod; kind: StatKind | null; selected: StatSelection | null };
}

export const initialUi: UiState = {
  view: null, lastAdmin: null, mainTab: "queue", filter: "전체", stageFilter: "pending", query: "", selected: null, panelMsg: "",
  expanded: new Set(), askSource: null, drawerOpen: false,
  nodes: { selected: null, adding: false },
  logs: { period: "week", user: "", solution: "", how: "", page: 1, selected: null },
  stats: { period: "month", kind: null, selected: null },
};

export type UiAction =
  | { type: "NAVIGATE"; view: View; nextSelected: string | null }
  | ({ type: "RESTORE"; nextSelected: string | null } & SavedPage)
  | { type: "SET_MAIN_TAB"; tab: MainTab }
  | { type: "SELECT"; key: string; view: View }
  | { type: "SELECT_SILENT"; key: string | null }
  | { type: "DESELECT" }
  | { type: "SET_FILTER"; filter: LevelFilter }
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

export const isStatTab = (t: MainTab): t is StatKind => t === "stats" || t === "ustats";
export const panelOnDemand = (tab: MainTab): boolean => tab === "ask" || isStatTab(tab);
// 설정의 작업 큐는 오른쪽 패널 없이 넓게 씁니다.
export const panelIdle = (s: UiState): boolean =>
  s.mainTab === "engine" || (panelOnDemand(s.mainTab) && !(s.mainTab === "ask" ? s.askSource : s.stats.selected));

function withTab(s: UiState, tab: MainTab): UiState {
  const askSource = tab !== s.mainTab ? null : s.askSource;
  const stats = isStatTab(tab) && s.stats.kind !== tab ? { ...s.stats, kind: tab, selected: null } : s.stats;
  return { ...s, mainTab: tab, askSource, stats };
}

function withView(s: UiState, view: View): UiState {
  if (view === s.view) return s;
  return { ...s, view, lastAdmin: isAdminView(view) ? view : s.lastAdmin, filter: "전체", panelMsg: "", askSource: null };
}

export function uiReducer(s: UiState, a: UiAction): UiState {
  switch (a.type) {
    case "NAVIGATE": {
      const tabs = VIEWS[a.view].tabs;
      return { ...withTab(withView(s, a.view), tabs.includes(s.mainTab) ? s.mainTab : tabs[0]), selected: a.nextSelected };
    }
    case "RESTORE": {
      const base = { ...s, stageFilter: a.stageFilter, lastAdmin: a.lastAdmin };
      return { ...withTab(withView(base, a.view), a.mainTab), selected: a.nextSelected };
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
    case "SET_FILTER":
      return { ...s, filter: a.filter };
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
      if (isStatTab(s.mainTab)) return { ...t, stats: { ...s.stats, selected: null } };
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
