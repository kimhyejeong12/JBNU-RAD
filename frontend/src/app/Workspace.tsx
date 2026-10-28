import { useUi } from "./ui/UiContext";
import { Seg } from "./Seg";
import { MainTabs } from "./MainTabs";
import { QueueTab } from "./queue/QueueTab";
import { RightPanel } from "./RightPanel";
import { Footer } from "./Footer";

import { NodesTab } from "@/features/nodes/NodesTab";

// 검토 현황은 늘 그려 두고 hidden 으로 숨깁니다. 노드 · 로그 · 질의 · 통계 탭은 들어올 때 마운트해 그때 데이터를 받습니다 (옛 화면의 loadNodes 등).
export function Workspace() {
  const { ui } = useUi();
  // 정책 질의 탭은 질의를 넓게 쓰고, 근거 칩을 눌렀을 때만 오른쪽에 인용 조항 패널을 엽니다.
  const cite = ui.mainTab === "ask" && !!ui.askSource;
  const stat = ui.mainTab === "stats" || ui.mainTab === "ustats";
  return (
    <div className={cite ? "workspace cite" : "workspace"} data-tab={ui.mainTab}>
      <div className="main-col">
        <Seg />
        <MainTabs />
        <QueueTab />
        {ui.mainTab === "nodes" ? <NodesTab /> : <section className="card nodes" id="view-nodes" role="tabpanel" aria-labelledby="tab-nodes" hidden />}
        <div className="stats-view" id="view-stats" role="tabpanel" aria-labelledby="tab-stats" hidden={!stat} />
        <section className="card logs" id="view-logs" role="tabpanel" aria-labelledby="tab-logs" hidden={ui.mainTab !== "logs"}>
          <div className="logs-head"><h3>로그 조회</h3></div>
        </section>
        <section className="card ask" id="view-ask" role="tabpanel" aria-labelledby="tab-ask" hidden={ui.mainTab !== "ask"} />
        <Footer />
      </div>
      <RightPanel />
    </div>
  );
}
