import type { ReactNode } from "react";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "@/app/queue/useQueue";
import { RequestPanel } from "@/features/requests/RequestPanel";
import { ReviewPanel } from "@/features/review/ReviewPanel";
import { NodesPanel } from "@/features/nodes/NodesPanel";
import { LogsPanel } from "@/features/logs/LogsPanel";
import { AskPanel } from "@/features/ask/AskPanel";
import { StatsPanel } from "@/features/stats/StatsPanel";
import { UserPanel } from "@/features/accounts/UserPanel";
import { AccessPanel } from "@/features/catalog/AccessPanel";
import { DocPanel } from "@/features/regulations/DocPanel";
import type { View } from "@/app/session/views";
import { PanelHead } from "@/app/ui/panel/Panel";
import { cn } from "@/shared/lib/cn";
import { card, empty, panelBody } from "@/shared/ui/base/styles";

// 오른쪽 패널 — 메뉴 · 탭마다 내용이 다릅니다. 작은 화면에서는 서랍으로 뜹니다. 일반 사용자에게는 없습니다 (Workspace).
export function RightPanel() {
  const { ui } = useUi();
  const items = useQueue();
  const it = items.find((i) => i.key === ui.selected);
  let body: ReactNode;
  if (ui.mainTab === "ask") body = <AskPanel />;
  else if (ui.mainTab === "logs") body = <LogsPanel />;
  else if (ui.mainTab === "nodes") body = <NodesPanel />;
  else if (ui.mainTab === "stats" || ui.mainTab === "ustats") body = <StatsPanel />;
  // 계정 · 권한 목록 · 기준 문서 메뉴에서 선택이 없으면 새로 만드는 · 올리는 폼입니다.
  else if (ui.view === "users" && (!it || it.type !== "user")) body = <UserPanel key="new" u={null} />;
  else if (it && (it.type === "req" || it.type === "mine")) body = <RequestPanel key={it.key} it={it} />;
  else if (it && it.type === "user") body = <UserPanel key={it.key} u={it.raw} />;
  else if (ui.view === "docs") body = <DocPanel key={it?.type === "doc" ? it.key : "new"} d={it?.type === "doc" ? it.raw : null} />;
  else if (ui.view === "access") body = <AccessPanel key={it?.type === "access" ? it.key : "new"} a={it?.type === "access" ? it.raw : null} />;
  else if (it && (it.type === "policy" || it.type === "server" || it.type === "event")) body = <ReviewPanel key={it.key} it={it} />;
  else body = <EmptyQueuePanel view={ui.view} />;
  // 질의 탭은 근거 칩을 누르기 전에는 패널을 두지 않습니다 (Workspace 와 같은 조건).
  const hidden = ui.mainTab === "ask" && !ui.askSource;
  return (
    <aside id="panel" className={cn(card, PANEL, ui.drawerOpen ? DRAWER_OPEN : DRAWER_SHUT, hidden && "hidden")}>
      {body}
    </aside>
  );
}

// 넓은 화면은 오른쪽 칸, 좁은 화면은 오른쪽에서 밀려 나오는 서랍 — 폰에서도 바깥을 눌러 닫을 48px 를 남깁니다.
// 밀려 나오는 움직임은 transform 전환이라 Tailwind 의 translate(별도 속성) 대신 transform 값을 그대로 씁니다.
const PANEL = "flex min-h-0 flex-col overflow-hidden narrow:fixed narrow:inset-y-0 narrow:right-0 narrow:z-50 narrow:w-[min(430px,calc(100vw-48px))] narrow:rounded-none narrow:border-0 narrow:shadow-[-12px_0_32px_rgba(0,0,0,.16)]";
const DRAWER_SHUT = "narrow:invisible narrow:transform-[translateX(100%)] narrow:[transition:transform_.2s_ease,visibility_0s_linear_.2s]";
const DRAWER_OPEN = "narrow:visible narrow:transform-none narrow:[transition:transform_.2s_ease]";

// 빈 패널도 메뉴를 따릅니다 (일반 사용자에게는 패널이 없습니다).
function EmptyQueuePanel({ view }: { view: View | null }) {
  const [title, text] = view === "requests"
    ? ["권한 신청 검토", <>목록에서 신청을 선택하면<br />신청 내용 · AI 판정 · 결재 기록이 표시됩니다.</>]
    : ["AI 판단 근거", <>목록에서 항목을 선택하면<br />AI 판단 근거와 권고가 표시됩니다.</>];
  return (
    <>
      <PanelHead title={title} />
      <div className={panelBody}><div className={empty}>{text}</div></div>
    </>
  );
}
