import { VIEWS, isAdminView, type MainTab } from "@/app/session/views";
import { useMe, useViews } from "@/app/session/me";
import { useQueue } from "@/app/queue/useQueue";
import { stageCounts } from "@/app/queue/select";
import type { StageFilter } from "@/app/ui/state/uiReducer";
import { useUi } from "@/app/ui/state/UiContext";
import { Icon } from "@/shared/ui/base/Icon";

const TABS: { tab: MainTab; icon: string; label: string; panel: string }[] = [
  { tab: "queue", icon: "list", label: "검토 현황", panel: "view-queue" },
  { tab: "nodes", icon: "server", label: "노드", panel: "view-nodes" },
  { tab: "stats", icon: "activity", label: "보안 통계", panel: "view-stats" },
  { tab: "ustats", icon: "warn", label: "사용자 위협", panel: "view-stats" },
  { tab: "logs", icon: "search", label: "로그 조회", panel: "view-logs" },
  { tab: "ask", icon: "chat", label: "질의", panel: "view-ask" },
  { tab: "engine", icon: "list", label: "작업 큐", panel: "view-engine" },
];

// 아래 테두리 2px 가 탭 줄의 선과 겹치게 1px 내립니다.
const TAB = "-mb-px inline-flex items-center gap-1.75 border-0 border-b-2 border-transparent bg-transparent px-3.5 py-2.25 text-[14px] font-bold text-ink-dim hover:text-ink aria-selected:border-b-ink aria-selected:text-ink";
const BAR = "flex gap-1 border-b border-line";

const STAGES: [StageFilter, string, string][] = [["pending", "결재 대기", "list"], ["active", "유효 권한", "key"], ["people", "확인할 사람", "users"], ["all", "전체", "file"]];

export function MainTabs() {
  const { ui, setMainTab, navigate, setStageFilter } = useUi();
  const views = useViews();
  const role = useMe().role;
  const counts = stageCounts(useQueue(), role);
  if (isAdminView(ui.view) && role === "top") {
    return (
      <nav className={BAR} role="tablist" aria-label="관리">
        {views.filter(isAdminView).map((v) => (
          <button key={v} role="tab" className={TAB} data-view={v} aria-selected={ui.view === v} aria-controls={v === "jobs" ? "view-engine" : "view-queue"} onClick={() => navigate(v)}>
            <Icon name={VIEWS[v].icon} small />{VIEWS[v].label}
          </button>
        ))}
      </nav>
    );
  }
  if (ui.view === "requests") {
    return (
      <nav className={BAR} role="tablist" aria-label="결재 단계">
        {STAGES.map(([k, label, icon]) => (
          <button key={k} role="tab" className={TAB} id={`stage-${k}`} aria-selected={ui.stageFilter === k} aria-controls="view-queue" onClick={() => setStageFilter(k)}>
            <Icon name={icon} small />{label}<span className="tabular-nums text-ink-faint">{counts[k]}</span>
          </button>
        ))}
      </nav>
    );
  }
  const tabs = ui.view ? VIEWS[ui.view].tabs : [];
  return (
    <nav className={BAR} role="tablist" aria-label="보기 전환" hidden={tabs.length < 2}>
      {TABS.map((t) => (
        <button key={t.tab} role="tab" className={TAB} id={`tab-${t.tab}`} aria-selected={ui.mainTab === t.tab} aria-controls={t.panel}
          hidden={!tabs.includes(t.tab)} onClick={() => setMainTab(t.tab)}>
          <Icon name={t.icon} small />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
