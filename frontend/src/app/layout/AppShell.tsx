import { useEffect } from "react";
import { MeContext, useMe } from "@/app/session/me";
import { HOME, restorable, readPage, savePage } from "@/app/session/views";
import { useNeeds, useBoot, useJobsWatcher } from "@/app/session/data";
import { DONE_MSG_MS, NARROW, UiContext, useUiStore } from "@/app/ui/state/UiContext";
import { NEW_ITEM } from "@/app/ui/state/uiReducer";
import { useQueue } from "@/app/queue/useQueue";
import { TopBar } from "./TopBar";
import { MainTabs } from "./MainTabs";
import { Workspace, workspace } from "./Workspace";
import { TooltipLayer } from "@/app/ui/Overlays";
import { AskDock } from "@/features/ask/AskDock";
import type { Me } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { card, empty } from "@/shared/ui/styles";
import { useMediaQuery, useEscape } from "@/shared/lib/hooks";
import { isDone } from "@/shared/lib/format";

export function AppShell({ me }: { me: Me }) {
  return (
    <MeContext.Provider value={me}>
      <Shell />
    </MeContext.Provider>
  );
}

// body 가 그리드라 감싸는 요소 없이 자식 순서를 지킵니다 (#root 는 display: contents).
function Shell() {
  const me = useMe();
  const store = useUiStore();
  const { ui, dispatch, navigate } = store;
  const boot = useBoot();
  useJobsWatcher(useNeeds().results);
  const narrow = useMediaQuery(NARROW);

  useEffect(() => toggleBody("drawerOpen", ui.drawerOpen), [ui.drawerOpen]);
  // 넓은 화면으로 바뀌면 서랍 상태를 풀어 배경 막이 남지 않게 합니다.
  useEffect(() => {
    if (!narrow) dispatch({ type: "CLOSE_DRAWER" });
  }, [narrow, dispatch]);
  useEscape(() => dispatch({ type: "CLOSE_PANEL" }));
  useEffect(() => {
    if (!boot.ready || ui.view !== null) return;
    const saved = restorable(readPage(me.login_id), me.role);
    if (saved) store.restore(saved);
    else navigate(HOME[me.role]);
  }, [boot.ready, ui.view, navigate, me.login_id, me.role, store]);
  useEffect(() => {
    if (ui.view) savePage(me.login_id, { view: ui.view, mainTab: ui.mainTab, stageFilter: ui.stageFilter, lastAdmin: ui.lastAdmin });
  }, [me.login_id, ui.view, ui.mainTab, ui.stageFilter, ui.lastAdmin]);
  useEffect(() => {
    if (!isDone(ui.panelMsg)) return;
    const t = setTimeout(() => dispatch({ type: "SET_PANEL_MSG", msg: "" }), DONE_MSG_MS);
    return () => clearTimeout(t);
  }, [ui.panelMsg, dispatch]);
  // 결재 · 회수로 목록에서 빠진 항목은 다른 메뉴에서 찾지 않고 선택을 비웁니다.
  const items = useQueue();
  useEffect(() => {
    if (ui.selected && ui.selected !== NEW_ITEM && !items.some((i) => i.key === ui.selected)) dispatch({ type: "SELECT_SILENT", key: null });
  }, [items, ui.selected, dispatch]);

  return (
    <UiContext.Provider value={store}>
      <TopBar />
      {/* 탭이 없어도 자리를 둡니다 — body 그리드 줄이 밀리지 않게. */}
      <div>{me.role !== "user" && <MainTabs />}</div>
      {boot.error ? <LoadError message={boot.error} /> : <Workspace />}
      <div id="drawer-back" onClick={store.closePanel}
        className={cn("hidden", ui.drawerOpen && "narrow:fixed narrow:inset-0 narrow:z-45 narrow:block narrow:bg-[rgba(17,17,17,.4)]")} />
      {!boot.error && <AskDock />}
      <TooltipLayer />
    </UiContext.Provider>
  );
}

function toggleBody(key: "drawerOpen", on: boolean) {
  if (on) document.body.dataset[key] = "true";
  else delete document.body.dataset[key];
  return () => { delete document.body.dataset[key]; };
}

export function LoadError({ message }: { message: string }) {
  return (
    <div className={workspace}>
      <div className={cn(card, empty, "col-span-full")}>서버에서 화면 데이터를 받지 못했습니다: {message}</div>
    </div>
  );
}
