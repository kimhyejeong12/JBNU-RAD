import { useMe } from "@/app/session/me";
import { useUi } from "@/app/ui/state/UiContext";
import { panelIdle } from "@/app/ui/state/uiReducer";
import { Seg } from "./Sidebar";
import { MainTabs } from "./MainTabs";
import { QueueTab } from "@/app/queue/QueueTab";
import { RightPanel } from "./RightPanel";
import { Footer } from "./Footer";
import { cn } from "@/shared/lib/cn";

import { NodesTab } from "@/features/nodes/NodesTab";
import { LogsTab } from "@/features/logs/LogsTab";
import { AskTab } from "@/features/ask/AskTab";
import { StatsTab } from "@/features/stats/StatsTab";
import { EngineTab } from "@/features/engine/EngineTab";

export const workspace = "grid min-h-0 grid-cols-[minmax(0,1fr)_430px] gap-4.5 px-5.5 pt-4.5 pb-5.5 narrow:grid-cols-[1fr] narrow:px-4 narrow:py-3.5";

// 검토 현황은 hidden 으로 숨겨 두고, 다른 탭은 들어올 때 마운트해 그때 데이터를 받습니다.
export function Workspace() {
  const me = useMe();
  const { ui } = useUi();
  const noPanel = me.role === "user";
  const wide = panelIdle(ui);
  const stat = ui.mainTab === "stats" || ui.mainTab === "ustats";
  return (
    <div className={cn(workspace, wide && "grid-cols-[minmax(0,1fr)] narrow:grid-cols-[minmax(0,1fr)]", noPanel && "grid-cols-[minmax(0,1fr)]")}>
      <div className="flex min-h-0 flex-col gap-3.5 overflow-auto narrow:overflow-visible *:shrink-0">
        <Seg />
        <MainTabs />
        <QueueTab />
        {ui.mainTab === "nodes" ? <NodesTab /> : <section id="view-nodes" role="tabpanel" aria-labelledby="tab-nodes" hidden />}
        {stat ? <StatsTab /> : <div id="view-stats" role="tabpanel" aria-labelledby="tab-stats" hidden />}
        {ui.mainTab === "logs" ? <LogsTab /> : <section id="view-logs" role="tabpanel" aria-labelledby="tab-logs" hidden />}
        {ui.mainTab === "ask" ? <AskTab /> : <section id="view-ask" role="tabpanel" aria-labelledby="tab-ask" hidden />}
        {ui.mainTab === "engine" ? <EngineTab /> : <section id="view-engine" role="tabpanel" aria-labelledby="tab-engine" hidden />}
        <Footer />
      </div>
      {!noPanel && <RightPanel />}
    </div>
  );
}
