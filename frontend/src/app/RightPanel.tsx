import type { ReactNode } from "react";
import { useUi } from "./ui/UiContext";
import { useQueue } from "./queue/useQueue";
import { EmptyQueuePanel } from "./queue/EmptyPanel";
import { RequestPanel } from "@/features/requests/RequestPanel";
import { ReviewPanel } from "@/features/review/ReviewPanel";
import { NodesPanel } from "@/features/nodes/NodesPanel";
import { LogsPanel } from "@/features/logs/LogsPanel";
import { AskPanel } from "@/features/ask/AskPanel";

// 오른쪽 패널 — 메뉴 · 탭마다 내용이 다릅니다. 작은 화면에서는 서랍으로 뜹니다.
export function RightPanel() {
  const { ui } = useUi();
  const items = useQueue();
  const it = items.find((i) => i.key === ui.selected);
  let body: ReactNode;
  if (ui.mainTab === "ask") body = <AskPanel />;
  else if (ui.mainTab === "logs") body = <LogsPanel />;
  else if (ui.mainTab === "nodes") body = <NodesPanel />;
  else if (it && (it.type === "req" || it.type === "mine")) body = <RequestPanel key={it.key} it={it} />;
  else if (it && (it.type === "policy" || it.type === "server" || it.type === "event")) body = <ReviewPanel key={it.key} it={it} />;
  else body = <EmptyQueuePanel view={ui.view} />;
  return (
    <aside className={ui.drawerOpen ? "card panel open" : "card panel"} id="panel">
      {body}
    </aside>
  );
}
