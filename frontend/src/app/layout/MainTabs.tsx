import { VIEWS, isAdminView, type MainTab } from "@/app/session/views";
import { useMe, useViews } from "@/app/session/me";
import { useQueue } from "@/app/queue/useQueue";
import { stageCounts } from "@/app/queue/select";
import type { StageFilter } from "@/app/ui/state/uiReducer";
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

// 아래 테두리 2px 가 탭 줄의 선과 겹치게 1px 내립니다. 고른 탭은 검은 글자 · 검은 밑줄.
const TAB = "-mb-px inline-flex items-center gap-1.75 border-0 border-b-2 border-transparent bg-transparent px-3.5 py-2.25 text-[14px] font-bold text-ink-dim hover:text-ink aria-selected:border-b-ink aria-selected:text-ink";
const BAR = "flex gap-1 border-b border-line";

const STAGES: [StageFilter, string, string][] = [["pending", "결재 대기", "list"], ["active", "유효 권한", "key"], ["all", "전체", "file"]];

export function MainTabs() {
  const { ui, setMainTab, navigate, setStageFilter } = useUi();
  const views = useViews();
  const counts = stageCounts(useQueue(), useMe().role);
  // 관리의 탭은 메뉴(권한 목록 · 계정 관리 · 기준 문서)를 오갑니다. 탭마다 목록 · 패널은 그 메뉴 그대로입니다.
  if (isAdminView(ui.view)) {
    return (
      <nav className={BAR} role="tablist" aria-label="관리">
        {views.filter(isAdminView).map((v) => (
          <button key={v} role="tab" className={TAB} data-view={v} aria-selected={ui.view === v} aria-controls="view-queue" onClick={() => navigate(v)}>
            <Icon name={VIEWS[v].icon} small />{VIEWS[v].label}
          </button>
        ))}
      </nav>
    );
  }
  // 권한 신청은 결재 단계를 탭으로 둡니다 — 정책 관리의 탭과 같은 자리 · 모양이라, 목록 머리에는 등급 거르기만 남아 눈이 덜 어지럽습니다.
  // 유효 권한(회수할 것) · 전체(지난 기록)는 결재 대기와 하는 일이 달라 탭으로 나누는 게 맞습니다. 탭마다 건수를 붙입니다.
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
  // 탭이 하나뿐이면 탭 줄 대신 대기열 제목으로 지금 메뉴를 알립니다.
  return (
    <nav className={BAR} role="tablist" aria-label="보기 전환" hidden={tabs.length < 2}>
      {TABS.map((t) => (
        <button key={t.tab} role="tab" className={TAB} id={`tab-${t.tab}`} aria-selected={ui.mainTab === t.tab} aria-controls={t.panel}
          hidden={!tabs.includes(t.tab)} onClick={() => setMainTab(t.tab)}>
          <Icon name={t.icon} small />
          {t.tab === "ask" ? <span id="tab-ask-label">{ASK[askMode(ui.view)].label}</span> : t.label}
        </button>
      ))}
    </nav>
  );
}
