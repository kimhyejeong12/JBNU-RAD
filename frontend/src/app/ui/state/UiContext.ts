import { createContext, useContext, useMemo, useReducer, type Dispatch } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { initialUi, uiReducer, type AskSource, type StageFilter, type UiAction, type UiState } from "./uiReducer";
import { TYPE_VIEW, type MainTab, type View } from "@/app/session/views";
import { firstKeyInView, inView } from "@/app/queue/select";
import { useQueue } from "@/app/queue/useQueue";
import { useMe } from "@/app/session/me";
import type { Level } from "@/shared/api/types";
import { useMediaQuery } from "@/shared/lib/hooks";

export const NARROW = "(max-width: 1150px)";

export interface UiStore {
  ui: UiState;
  dispatch: Dispatch<UiAction>;
  navigate(view: View): void;
  select(key: string): void;
  selectSilent(key: string | null): void;
  deselect(): void;
  setMainTab(tab: MainTab): void;
  closePanel(): void;
  openDrawer(): void;
  openLogs(cond: Partial<UiState["logs"]>): void;
  toggleFilter(level: Level): void;
  setQuery(query: string): void;
  setStageFilter(value: StageFilter): void;
  setPanelMsg(msg: string): void;
  toggleChip(key: string): void;
  pickNode(name: string | null): void;
  addNode(): void;
  setLogs(patch: Partial<UiState["logs"]>): void;
  setStats(patch: Partial<UiState["stats"]>): void;
  setAskSource(src: AskSource | null): void;
  // 다른 메뉴로 이어 보기 (통계 패널 · 노드 패널에서)
  gotoNode(name: string): void;
  gotoActiveGrant(no: string): void;
  gotoEvent(key: string): void;
}

export const UiContext = createContext<UiStore | null>(null);

export function useUi(): UiStore {
  const store = useContext(UiContext);
  if (!store) throw new Error("UiContext 밖에서 useUi 를 불렀습니다");
  return store;
}

// 상태와 동작을 한 곳에서 만듭니다. 메뉴 · 거르기를 바꿀 때 고를 첫 항목은 큐에서 셉니다.
export function useUiStore(): UiStore {
  const me = useMe();
  const items = useQueue();
  const [ui, dispatch] = useReducer(uiReducer, initialUi);
  const narrow = useMediaQuery(NARROW);
  const qc = useQueryClient();
  return useMemo<UiStore>(() => {
    const role = me.role;
    const current = items.find((i) => i.key === ui.selected);
    // 패널도 메뉴를 따릅니다. 다른 메뉴의 항목이 남아 있으면 이 메뉴의 첫 항목으로 바꿉니다.
    const keepOrFirst = (view: View, stage: StageFilter) =>
      current && inView(current, view, stage, role) ? current.key : firstKeyInView(items, view, stage, role);
    // 작은 화면에서만 패널을 서랍으로 띄웁니다.
    const openDrawer = () => {
      if (narrow) dispatch({ type: "OPEN_DRAWER" });
    };
    return {
      ui, dispatch, openDrawer,
      navigate: (view) => dispatch({ type: "NAVIGATE", view, nextSelected: keepOrFirst(view, ui.stageFilter) }),
      select: (key) => {
        const it = items.find((i) => i.key === key);
        const view = it ? TYPE_VIEW[it.type] : ui.view;
        if (view) dispatch({ type: "SELECT", key, view });
        openDrawer();
      },
      selectSilent: (key) => dispatch({ type: "SELECT_SILENT", key }),
      deselect: () => {
        dispatch({ type: "DESELECT" });
        openDrawer();
      },
      setMainTab: (tab) => dispatch({ type: "SET_MAIN_TAB", tab }),
      closePanel: () => dispatch({ type: "CLOSE_PANEL" }),
      // 다른 화면(로그 감시 판정)에서 조건을 정해 엽니다 — 옛 화면처럼 그때 다시 받습니다.
      openLogs: (cond) => {
        qc.removeQueries({ queryKey: ["logs"] });
        dispatch({ type: "OPEN_LOGS", cond });
      },
      toggleFilter: (level) => dispatch({ type: "TOGGLE_FILTER", level }),
      setQuery: (query) => dispatch({ type: "SET_QUERY", query }),
      setStageFilter: (value) => {
        if (ui.view) dispatch({ type: "SET_STAGE_FILTER", value, nextSelected: keepOrFirst(ui.view, value) });
      },
      setPanelMsg: (msg) => dispatch({ type: "SET_PANEL_MSG", msg }),
      toggleChip: (key) => dispatch({ type: "TOGGLE_CHIP", key }),
      pickNode: (name) => {
        dispatch({ type: "PICK_NODE", name });
        openDrawer();
      },
      addNode: () => {
        dispatch({ type: "ADD_NODE" });
        openDrawer();
      },
      setLogs: (patch) => dispatch({ type: "SET_LOGS", patch }),
      setStats: (patch) => dispatch({ type: "SET_STATS", patch }),
      setAskSource: (src) => dispatch({ type: "SET_ASK_SOURCE", src }),
      gotoNode: (name) => {
        dispatch({ type: "NAVIGATE", view: "policies", nextSelected: keepOrFirst("policies", ui.stageFilter) });
        dispatch({ type: "SET_MAIN_TAB", tab: "nodes" });
        dispatch({ type: "PICK_NODE", name });
        openDrawer();
      },
      gotoActiveGrant: (no) => {
        dispatch({ type: "NAVIGATE", view: "requests", nextSelected: `req:${no}` });
        dispatch({ type: "SET_STAGE_FILTER", value: "active", nextSelected: `req:${no}` });
        openDrawer();
      },
      gotoEvent: (key) => {
        dispatch({ type: "NAVIGATE", view: "events", nextSelected: key });
        openDrawer();
      },
    };
  }, [ui, items, me.role, narrow, qc]);
}

// 패널에서 하는 동작 — 성공 문구는 동작이 돌려주고, 오류는 서버 문장을 그대로 띄웁니다. 끝나면 그 목록을 다시 받아 서버 값으로 그립니다.
export function usePanelAction<V>(run: (v: V) => Promise<string>, refresh: QueryKey) {
  const qc = useQueryClient();
  const { setPanelMsg } = useUi();
  return useMutation({
    mutationFn: run,
    onSuccess: (msg) => setPanelMsg(msg),
    onError: (e) => setPanelMsg(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: refresh }),
  });
}
