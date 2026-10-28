import { VIEWS, type MainTab, type View } from "./views";
import { useUi } from "./ui/UiContext";
import { Icon } from "@/shared/ui/Icon";

const TABS: { tab: MainTab; icon: string; label: string; panel: string }[] = [
  { tab: "queue", icon: "list", label: "검토 현황", panel: "view-queue" },
  { tab: "nodes", icon: "server", label: "노드", panel: "view-nodes" },
  { tab: "stats", icon: "activity", label: "보안 통계", panel: "view-stats" },
  { tab: "ustats", icon: "warn", label: "사용자 위협", panel: "view-stats" },
  { tab: "logs", icon: "search", label: "로그 조회", panel: "view-logs" },
  { tab: "ask", icon: "chat", label: "정책 질의", panel: "view-ask" },
];

// 질의 탭은 메뉴를 따릅니다 (정책 관리 → 서버 질의, 로그 감시 → 로그 질의).
const askLabel = (view: View | null) => (view === "policies" ? "서버 질의" : view === "events" ? "로그 질의" : "정책 질의");

export function MainTabs() {
  const { ui, setMainTab } = useUi();
  const tabs = ui.view ? VIEWS[ui.view].tabs : [];
  // 탭이 하나뿐이면 탭 줄 대신 대기열 제목으로 지금 메뉴를 알립니다.
  return (
    <nav className="main-tabs" role="tablist" aria-label="보기 전환" hidden={tabs.length < 2}>
      {TABS.map((t) => (
        <button key={t.tab} className="main-tab" role="tab" id={`tab-${t.tab}`} aria-selected={ui.mainTab === t.tab} aria-controls={t.panel}
          hidden={!tabs.includes(t.tab)} onClick={() => setMainTab(t.tab)}>
          <Icon name={t.icon} className="sm" />
          {t.tab === "ask" ? <span id="tab-ask-label">{askLabel(ui.view)}</span> : t.label}
        </button>
      ))}
    </nav>
  );
}
