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

// 작업 공간 칸 — 목록과 오른쪽 패널(430px). 좁은 화면은 한 칸 (1fr 이라 넓은 표를 펼치면 칸이 표만큼 넓어집니다 — 옛 화면 그대로).
// 받아 오지 못했을 때의 안내(AppShell)도 같은 칸을 씁니다.
export const workspace = "grid min-h-0 grid-cols-[minmax(0,1fr)_430px] gap-4.5 px-5.5 pt-4.5 pb-5.5 narrow:grid-cols-[1fr] narrow:px-4 narrow:py-3.5";

// 검토 현황은 늘 그려 두고 hidden 으로 숨깁니다. 노드 · 로그 · 질의 · 통계 탭은 들어올 때 마운트해 그때 데이터를 받습니다 (옛 화면의 loadNodes 등).
export function Workspace() {
  const me = useMe();
  const { ui } = useUi();
  // 일반 사용자는 오른쪽 패널이 없습니다 — 내 신청의 내용 · 상태는 목록에 다 있고, 철회도 목록 줄에서 합니다.
  const noPanel = me.role === "user";
  // 질의 · 통계 탭은 근거 칩 · 줄을 골랐을 때만 오른쪽 패널을 엽니다 (그 전에는 전체 폭, 좁은 화면에서도 한 칸 minmax).
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
        <Footer />
      </div>
      {!noPanel && <RightPanel />}
    </div>
  );
}
