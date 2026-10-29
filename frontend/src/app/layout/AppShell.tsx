import { useEffect, useState } from "react";
import { MeContext, useViews } from "@/app/session/me";
import { useNeeds } from "@/app/session/data";
import { NARROW, UiContext, useUiStore } from "@/app/ui/state/UiContext";
import { useBoot } from "@/app/session/useBoot";
import { useJobsWatcher } from "@/app/session/useJobsWatcher";
import { useQueue } from "@/app/queue/useQueue";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { Workspace, workspace } from "./Workspace";
import { DocsModal } from "@/app/overlays/DocsModal";
import { TooltipLayer } from "@/app/overlays/TooltipLayer";
import type { Me } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { card, empty } from "@/shared/ui/base/styles";
import { useMediaQuery } from "@/shared/lib/hooks";

export function AppShell({ me }: { me: Me }) {
  return (
    <MeContext.Provider value={me}>
      <Shell />
    </MeContext.Provider>
  );
}

// body 가 그리드라 자식 순서를 지키고 감싸는 요소를 두지 않습니다 (#root 는 display: contents).
// body 의 칸 나누기 · 스크롤은 진입 CSS 가 data-solo · data-drawer-open 으로 정합니다.
function Shell() {
  const views = useViews();
  const store = useUiStore();
  const { ui, dispatch, navigate } = store;
  const boot = useBoot();
  useJobsWatcher(useNeeds().results);
  const [docsOpen, setDocsOpen] = useState(false);
  const narrow = useMediaQuery(NARROW);

  // 메뉴가 하나뿐인 일반 사용자는 사이드바 없이 신청 화면만 씁니다.
  const solo = views.length < 2;
  useEffect(() => toggleBody("solo", solo), [solo]);
  useEffect(() => toggleBody("drawerOpen", ui.drawerOpen), [ui.drawerOpen]);
  // 넓은 화면으로 바뀌면 서랍 상태를 풀어 배경 막이 남지 않게 합니다.
  useEffect(() => {
    if (!narrow) dispatch({ type: "CLOSE_DRAWER" });
  }, [narrow, dispatch]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDocsOpen(false);
      dispatch({ type: "CLOSE_PANEL" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dispatch]);
  // 데이터를 다 받으면 첫 메뉴를 엽니다.
  useEffect(() => {
    if (boot.ready && ui.view === null) navigate(views[0]);
  }, [boot.ready, ui.view, navigate, views]);
  // 결재 · 회수로 목록에서 빠진 항목을 고르고 있었으면 같은 신청을 다른 메뉴에서 찾지 않고 그대로 비웁니다.
  const items = useQueue();
  useEffect(() => {
    if (ui.selected && !items.some((i) => i.key === ui.selected)) dispatch({ type: "SELECT_SILENT", key: null });
  }, [items, ui.selected, dispatch]);

  return (
    <UiContext.Provider value={store}>
      <TopBar />
      <Sidebar onDocs={() => setDocsOpen(true)} />
      {boot.error ? <LoadError message={boot.error} /> : <Workspace />}
      <div id="drawer-back" onClick={store.closePanel}
        className={cn("hidden", ui.drawerOpen && "narrow:fixed narrow:inset-0 narrow:z-45 narrow:block narrow:bg-[rgba(17,17,17,.4)]")} />
      <DocsModal open={docsOpen} onClose={() => setDocsOpen(false)} />
      <TooltipLayer />
    </UiContext.Provider>
  );
}

// body 의 상태 속성 — 켜면 "true", 끄면 지웁니다. 화면을 떠날 때도 지웁니다.
function toggleBody(key: "solo" | "drawerOpen", on: boolean) {
  if (on) document.body.dataset[key] = "true";
  else delete document.body.dataset[key];
  return () => { delete document.body.dataset[key]; };
}

// 화면 데이터를 못 받으면 작업 공간 자리에 이유를 띄웁니다.
export function LoadError({ message }: { message: string }) {
  return (
    <div className={workspace}>
      <div className={cn(card, empty, "col-span-full")}>서버에서 화면 데이터를 받지 못했습니다: {message}</div>
    </div>
  );
}
