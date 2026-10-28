import { useUi } from "./ui/UiContext";
import { EmptyQueuePanel } from "./queue/EmptyPanel";

// 오른쪽 패널 — 메뉴 · 탭마다 내용이 다릅니다. 작은 화면에서는 서랍으로 뜹니다.
export function RightPanel() {
  const { ui } = useUi();
  return (
    <aside className={ui.drawerOpen ? "card panel open" : "card panel"} id="panel">
      <EmptyQueuePanel view={ui.view} />
    </aside>
  );
}
