import type { ReactNode } from "react";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "@/app/queue/useQueue";
import { RequestPanel } from "@/features/requests/RequestPanel";
import { PersonPanel } from "@/features/requests/PersonPanel";
import { ReviewPanel } from "@/features/review/ReviewPanel";
import { NodesPanel } from "@/features/nodes/NodesPanel";
import { LogsPanel } from "@/features/logs/LogsPanel";
import { StatsPanel } from "@/features/stats/StatsPanel";
import { UserPanel } from "@/features/accounts/UserPanel";
import { AccessPanel } from "@/features/catalog/AccessPanel";
import { DocPanel } from "@/features/regulations/DocPanel";
import type { View } from "@/app/session/views";
import { PanelHead } from "@/app/ui/panel/Panel";
import { cn } from "@/shared/lib/cn";
import { NEW_ITEM, panelIdle } from "@/app/ui/state/uiReducer";
import { useMe } from "@/app/session/me";
import { card, empty, panelBody } from "@/shared/ui/base/styles";

export function RightPanel() {
  const { ui } = useUi();
  const items = useQueue();
  const it = items.find((i) => i.key === ui.selected);
  let body: ReactNode;
  if (ui.mainTab === "logs") body = <LogsPanel />;
  else if (ui.mainTab === "nodes") body = <NodesPanel />;
  else if (ui.mainTab === "stats" || ui.mainTab === "ustats") body = <StatsPanel />;
  else if (ui.selected === NEW_ITEM && ui.view === "users") body = <UserPanel key="new" u={null} />;
  else if (ui.selected === NEW_ITEM && ui.view === "access") body = <AccessPanel key="new" a={null} />;
  else if (ui.selected === NEW_ITEM && ui.view === "docs") body = <DocPanel key="new" d={null} />;
  else if (it && it.type === "req") body = <RequestPanel key={it.key} it={it} />;
  else if (it && it.type === "person") body = <PersonPanel key={it.key} it={it} />;
  else if (it && it.type === "user") body = <UserPanel key={it.key} u={it.raw} />;
  else if (it && it.type === "doc") body = <DocPanel key={it.key} d={it.raw} />;
  else if (it && it.type === "access") body = <AccessPanel key={it.key} a={it.raw} />;
  else if (it && (it.type === "policy" || it.type === "server" || it.type === "event")) body = <ReviewPanel key={it.key} it={it} />;
  else body = <EmptyQueuePanel view={ui.view} />;
  const hidden = panelIdle(ui);
  return (
    <aside id="panel" className={cn(card, PANEL, ui.drawerOpen ? DRAWER_OPEN : DRAWER_SHUT, hidden && "hidden")}>
      {body}
    </aside>
  );
}

// transform 전환이라 Tailwind 의 translate 대신 transform 값을 그대로 씁니다.
const PANEL = "flex min-h-0 flex-col overflow-hidden narrow:fixed narrow:inset-y-0 narrow:right-0 narrow:z-50 narrow:w-[min(430px,calc(100vw-48px))] narrow:rounded-none narrow:border-0 narrow:shadow-[-12px_0_32px_rgba(0,0,0,.16)]";
const DRAWER_SHUT = "narrow:invisible narrow:transform-[translateX(100%)] narrow:[transition:transform_.2s_ease,visibility_0s_linear_.2s]";
const DRAWER_OPEN = "narrow:visible narrow:transform-none narrow:[transition:transform_.2s_ease]";

function EmptyQueuePanel({ view }: { view: View | null }) {
  const top = useMe().role === "top";
  const people = useUi().ui.stageFilter === "people";
  const [title, text] = view === "requests" && people
    ? ["확인할 사람", <>사람을 고르세요</>]
    : view === "requests"
    ? ["권한 신청 검토", <>신청을 고르세요</>]
    : view === "users" ? ["계정", <>목록에서 계정을 고르거나<br />[새 계정]을 누르세요.</>]
      : view === "access" ? ["권한", <>목록에서 권한을 고르거나<br />[권한 등록]을 누르세요.</>]
        : view === "docs" ? ["기준 문서", top ? <>목록에서 문서를 고르거나<br />[문서 업로드]를 누르세요.</> : <>목록에서 문서를 고르면<br />원문을 봅니다.</>]
          : ["AI 판단 근거", <>목록에서 항목을 선택하면<br />AI 판단 근거와 권고가 표시됩니다.</>];
  return (
    <>
      <PanelHead title={title} />
      <div className={panelBody}><div className={empty}>{text}</div></div>
    </>
  );
}
