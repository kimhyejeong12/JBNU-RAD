import { Fragment } from "react";
import { useMe } from "@/app/session/me";
import { useUi } from "@/app/ui/state/UiContext";
import { panelIdle } from "@/app/ui/state/uiReducer";
import { useJobs, useResults } from "@/app/session/data";
import { footerWarnings } from "@/app/layout/lib";
import { RESULT_VIEWS } from "@/app/session/views";
import { QueueHead } from "@/app/queue/QueueHead";
import { QueueTable } from "@/app/queue/QueueTable";
import { RightPanel } from "./RightPanel";
import { NodesTab } from "@/features/nodes/NodesTab";
import { LogsTab } from "@/features/logs/LogsTab";
import { StatsTab } from "@/features/stats/StatsTab";
import { RiskTab } from "@/features/risk/RiskTab";
import { OverviewTab } from "@/features/overview/OverviewTab";
import { EngineTab } from "@/features/engine/EngineTab";
import { RequestForm } from "@/features/requests/RequestForm";
import { MineList } from "@/features/requests/MineList";
import { cn } from "@/shared/lib/cn";
import { stamp } from "@/shared/lib/format";
import { card } from "@/shared/ui/styles";


export const workspace = "grid min-h-0 grid-cols-[minmax(0,1fr)_clamp(430px,30%,640px)] gap-4.5 px-5.5 pt-4.5 pb-5.5 narrow:grid-cols-[1fr] narrow:px-4 narrow:py-3.5";

// 검토 현황은 hidden 으로 숨겨 두고, 다른 탭은 들어올 때 마운트해 그때 데이터를 받음
export function Workspace() {
  const me = useMe();
  const { ui } = useUi();
  const noPanel = me.role === "user";
  const wide = panelIdle(ui);
  const stat = ui.mainTab === "stats" || ui.mainTab === "ustats";
  return (
    <div className={cn(workspace, wide && "grid-cols-[minmax(0,1fr)] narrow:grid-cols-[minmax(0,1fr)]", noPanel ? "grid-cols-[minmax(0,1fr)] p-0 narrow:p-0" : cn("narrow:pb-21", wide && "pb-21"))}>
      <div className="flex min-h-0 flex-col gap-3.5 overflow-auto narrow:overflow-visible *:shrink-0">
        <QueueTab />
        {ui.mainTab === "nodes" ? <NodesTab /> : <section id="view-nodes" role="tabpanel" aria-labelledby="tab-nodes" hidden />}
        {ui.mainTab === "overview" ? <OverviewTab /> : <section id="view-overview" role="tabpanel" aria-labelledby="tab-overview" hidden />}
        {ui.mainTab === "risk" ? <RiskTab /> : <section id="view-risk" role="tabpanel" aria-labelledby="tab-risk" hidden />}
        {stat ? <StatsTab /> : <div id="view-stats" role="tabpanel" aria-labelledby="tab-stats" hidden />}
        {ui.mainTab === "logs" ? <LogsTab /> : <section id="view-logs" role="tabpanel" aria-labelledby="tab-logs" hidden />}
        {ui.mainTab === "engine" ? <EngineTab /> : <section id="view-engine" role="tabpanel" aria-labelledby="tab-engine" hidden />}
        <Footer />
      </div>
      {!noPanel && <RightPanel />}
    </div>
  );
}

// 계산 시각 · 분석 경고는 그 메뉴의 검토 현황에서만 보임
export function Footer() {
  const { ui } = useUi();
  const results = useResults();
  const jobs = useJobs();
  const hidden = ui.mainTab !== "queue" || !ui.view || !RESULT_VIEWS.has(ui.view);
  if (hidden) return <footer id="foot" hidden />;
  const warns = footerWarnings(results, jobs);
  return (
    <footer className="px-1 py-0.5 text-[11.5px] text-ink-dim" id="foot">
      {results.generated_at ? `계산 시각 ${stamp(results.generated_at)}` : "아직 분석하지 않았습니다"}
      {warns.map((w, i) => <Fragment key={i}>{"  "}<span className="ml-2.5 text-risk">{w}</span></Fragment>)}
    </footer>
  );
}

export function QueueTab() {
  const me = useMe();
  const { ui } = useUi();
  return (
    // 운영자는 목록 카드가 남는 높이를 채우고 그 안에서 스크롤함 — 왼쪽 칸의 shrink-0 을 이 칸만 풂
    <div className={cn("flex flex-col gap-3.5", me.role !== "user" && "min-h-0 flex-1 shrink!")} id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={ui.mainTab !== "queue"}>
      {me.role === "user" ? (
        // 왼쪽 신청서(1/3) · 오른쪽 내 신청(2/3) — 좁은 화면에서는 신청서가 위로 감
        <div className="mx-auto flex w-full max-w-[1600px] flex-col px-6 py-8 phone:px-4 phone:py-5">
          <div className="mb-6">
            <h1 className="m-0 text-2xl font-bold">권한 신청</h1>
            <p className="m-0 mt-1 text-sm text-ink-dim">업무에 필요한 시스템 권한을 신청하고 결재 진행 상황을 확인합니다.</p>
          </div>
          <div className="grid grid-cols-12 gap-8 narrow:grid-cols-1">
            <div className="col-span-4 flex flex-col narrow:col-span-1"><RequestForm /></div>
            <div className="col-span-8 flex min-w-0 flex-col narrow:col-span-1"><MineList /></div>
          </div>
        </div>
      ) : (
        <>
          <QueueHead />
          <section className={cn(card, "flex min-h-80 flex-1 flex-col overflow-hidden")}><QueueTable /></section>
        </>
      )}
    </div>
  );
}
