import { createContext, useContext, useMemo, useReducer, type Dispatch } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { initialUi, uiReducer, type AskSource, type LevelFilter, type StageFilter, type UiAction, type UiState } from "./uiReducer";
import { ROLE_VIEWS, TYPE_VIEW, isAdminView, type MainTab, type SavedPage, type View } from "@/app/session/views";
import { firstKeyInView, inView } from "@/app/queue/select";
import { useQueue } from "@/app/queue/useQueue";
import { useMe } from "@/app/session/me";
import { useMediaQuery } from "@/shared/lib/hooks";

export const NARROW = "(max-width: 1150px)";

// 오류 안내는 고칠 때까지 봐야 해서 완료(✓) 안내만 저절로 지웁니다.
export const DONE_MSG_MS = 4000;

export interface UiStore {
  ui: UiState;
  dispatch: Dispatch<UiAction>;
  navigate(view: View): void;
  restore(page: SavedPage): void;
  openAdmin(): void;
  select(key: string): void;
  selectSilent(key: string | null): void;
  deselect(): void;
  setMainTab(tab: MainTab): void;
  closePanel(): void;
  openDrawer(): void;
  openLogs(cond: Partial<UiState["logs"]>): void;
  setFilter(filter: LevelFilter): void;
  setQuery(query: string): void;
  setStageFilter(value: StageFilter): void;
  setPanelMsg(msg: string): void;
  toggleChip(key: string): void;
  pickNode(name: string | null): void;
  addNode(): void;
  setLogs(patch: Partial<UiState["logs"]>): void;
  setStats(patch: Partial<UiState["stats"]>): void;
  setAskSource(src: AskSource | null): void;
  setConversation(id: string): void;
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

export function useUiStore(): UiStore {
  const me = useMe();
  const items = useQueue();
  const [ui, dispatch] = useReducer(uiReducer, initialUi);
  const narrow = useMediaQuery(NARROW);
  const qc = useQueryClient();
  return useMemo<UiStore>(() => {
    const role = me.role;
    const current = items.find((i) => i.key === ui.selected);
    const keepOrFirst = (view: View, stage: StageFilter) =>
      current && inView(current, view, stage, role) ? current.key : firstKeyInView(items, view, stage, role);
    const openDrawer = () => {
      if (narrow) dispatch({ type: "OPEN_DRAWER" });
    };
    return {
      ui, dispatch, openDrawer,
      navigate: (view) => dispatch({ type: "NAVIGATE", view, nextSelected: keepOrFirst(view, ui.stageFilter) }),
      restore: (page) => dispatch({ type: "RESTORE", ...page, nextSelected: firstKeyInView(items, page.view, page.stageFilter, role) }),
      openAdmin: () => {
        const view = ui.lastAdmin ?? ROLE_VIEWS[role].find(isAdminView);
        if (view) dispatch({ type: "NAVIGATE", view, nextSelected: keepOrFirst(view, ui.stageFilter) });
      },
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
      openLogs: (cond) => {
        qc.removeQueries({ queryKey: ["logs"] });
        dispatch({ type: "OPEN_LOGS", cond });
      },
      setFilter: (filter) => dispatch({ type: "SET_FILTER", filter }),
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
      setConversation: (id) => {
        dispatch({ type: "SET_CONVERSATION", id });
        dispatch({ type: "CLOSE_DRAWER" });
      },
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
