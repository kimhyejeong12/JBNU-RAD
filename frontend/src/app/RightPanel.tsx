import type { ReactNode } from "react";
import { useUi } from "./ui/UiContext";
import { useQueue } from "./queue/useQueue";
import { RequestPanel } from "@/features/requests/RequestPanel";
import { ReviewPanel } from "@/features/review/ReviewPanel";
import { NodesPanel } from "@/features/nodes/NodesPanel";
import { LogsPanel } from "@/features/logs/LogsPanel";
import { AskPanel } from "@/features/ask/AskPanel";
import { StatsPanel } from "@/features/stats/StatsPanel";
import { UserPanel } from "@/features/accounts/UserPanel";
import { AccessPanel } from "@/features/catalog/AccessPanel";
import type { View } from "./views";
import { PanelHead } from "./ui/panel";

// 오른쪽 패널 — 메뉴 · 탭마다 내용이 다릅니다. 작은 화면에서는 서랍으로 뜹니다.
export function RightPanel() {
  const { ui } = useUi();
  const items = useQueue();
  const it = items.find((i) => i.key === ui.selected);
  let body: ReactNode;
  if (ui.mainTab === "ask") body = <AskPanel />;
  else if (ui.mainTab === "logs") body = <LogsPanel />;
  else if (ui.mainTab === "nodes") body = <NodesPanel />;
  else if (ui.mainTab === "stats" || ui.mainTab === "ustats") body = <StatsPanel />;
  // 계정 · 권한 목록 메뉴에서 선택이 없으면 새로 만드는 폼입니다.
  else if (ui.view === "users" && (!it || it.type !== "user")) body = <UserPanel key="new" u={null} />;
  else if (it && (it.type === "req" || it.type === "mine")) body = <RequestPanel key={it.key} it={it} />;
  else if (it && it.type === "user") body = <UserPanel key={it.key} u={it.raw} />;
  else if (ui.view === "access") body = <AccessPanel key={it?.type === "access" ? it.key : "new"} a={it?.type === "access" ? it.raw : null} />;
  else if (it && (it.type === "policy" || it.type === "server" || it.type === "event")) body = <ReviewPanel key={it.key} it={it} />;
  else body = <EmptyQueuePanel view={ui.view} />;
  return (
    <aside className={ui.drawerOpen ? "card panel open" : "card panel"} id="panel">
      {body}
    </aside>
  );
}

// 빈 패널도 메뉴를 따릅니다. 일반 사용자에게는 AI 문구를 보이지 않습니다.
function EmptyQueuePanel({ view }: { view: View | null }) {
  const [title, text] = view === "mine"
    ? ["내 신청", <>신청하거나 목록에서 신청을 고르면<br />결재 상태와 기록이 표시됩니다.</>]
    : view === "requests"
      ? ["권한 신청 검토", <>목록에서 신청을 선택하면<br />신청 내용 · AI 판정 · 결재 기록이 표시됩니다.</>]
      : ["AI 판단 근거", <>목록에서 항목을 선택하면<br />AI 판단 근거와 권고가 표시됩니다.</>];
  return (
    <>
      <PanelHead title={title} />
      <div className="panel-body"><div className="empty">{text}</div></div>
    </>
  );
}
