import { VIEWS, type MainTab } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { ASK } from "@/features/ask/config";
import { askMode } from "@/features/ask/lib";
import { Icon } from "@/shared/ui/base/Icon";

const TABS: { tab: MainTab; icon: string; label: string; panel: string }[] = [
  { tab: "queue", icon: "list", label: "검토 현황", panel: "view-queue" },
  { tab: "nodes", icon: "server", label: "노드", panel: "view-nodes" },
  { tab: "stats", icon: "activity", label: "보안 통계", panel: "view-stats" },
  { tab: "ustats", icon: "warn", label: "사용자 위협", panel: "view-stats" },
  { tab: "logs", icon: "search", label: "로그 조회", panel: "view-logs" },
  { tab: "ask", icon: "chat", label: "정책 질의", panel: "view-ask" },
];

export function MainTabs() {
  const { ui, setMainTab } = useUi();
  const tabs = ui.view ? VIEWS[ui.view].tabs : [];
  // 탭이 하나뿐이면 탭 줄 대신 대기열 제목으로 지금 메뉴를 알립니다.
  return (
    <nav className="flex gap-1 border-b border-line" role="tablist" aria-label="보기 전환" hidden={tabs.length < 2}>
      {TABS.map((t) => (
        // 아래 테두리 2px 가 탭 줄의 선과 겹치게 1px 내립니다. 고른 탭은 검은 글자 · 검은 밑줄.
        <button key={t.tab} role="tab"
          className="-mb-px inline-flex items-center gap-[7px] border-0 border-b-2 border-transparent bg-transparent px-[14px] py-[9px] text-[14px] font-bold text-ink-dim hover:text-ink aria-selected:border-b-ink aria-selected:text-ink" id={`tab-${t.tab}`} aria-selected={ui.mainTab === t.tab} aria-controls={t.panel}
          hidden={!tabs.includes(t.tab)} onClick={() => setMainTab(t.tab)}>
          <Icon name={t.icon} small />
          {t.tab === "ask" ? <span id="tab-ask-label">{ASK[askMode(ui.view)].label}</span> : t.label}
        </button>
      ))}
    </nav>
  );
}
