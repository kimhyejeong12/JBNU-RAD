import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import type { StageFilter } from "@/app/ui/state/uiReducer";
import { runButton, useStartJob } from "@/shared/api/jobs";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { select, toolButton } from "@/shared/ui/base/styles";

// 대기열 제목 줄 — 검색 · 결재 단계 거르기 · 실행 버튼. 세 버튼은 빼지 않고 hidden 으로 숨기고,
// 첫 버튼만 오른쪽으로 밀고 뒤의 둘은 왼쪽 여백 없이 붙입니다 (숨은 버튼도 자리를 세던 옛 규칙과 같게).
export function QueueHead() {
  const me = useMe();
  const { ui, setQuery, setStageFilter, deselect } = useUi();
  const jobs = useJobs();
  const start = useStartJob();
  const meta = ui.view ? VIEWS[ui.view] : null;
  const title = ui.view === "requests"
    ? `${meta?.label} — ${me.role === "manager" ? "1차" : "최종"} 결재함`
    : meta?.title ?? "현황";
  // 분석 실행은 정책 관리만 합니다. 수 분 걸리므로 진행 상황을 버튼에 띄웁니다.
  const run = runButton(jobs, ui.view, start.isPending);
  return (
    <div className="flex flex-wrap items-center gap-3 px-4.5 pt-4 pb-3">
      <h3 id="queue-title" className="m-0 text-[15.5px] font-bold">{title}</h3>
      <label className="ml-auto flex h-8 max-w-[320px] flex-[1_1_220px] items-center gap-2 rounded-lg border border-line bg-surface px-2.75 text-[13px] text-ink-dim focus-within:border-ink">
        <Icon name="search" small />
        <input id="q" type="search" className="flex-1 border-none bg-transparent px-0.5 py-px text-ink outline-none font-[inherit] [font-size:inherit] [font-weight:inherit] leading-[inherit]" placeholder={meta?.search ?? ""} autoComplete="off" value={ui.query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <select id="stage-filter" className={select} aria-label="결재 단계" hidden={ui.view !== "requests"} value={ui.stageFilter}
        onChange={(e) => setStageFilter(e.target.value as StageFilter)}>
        <option value="pending">결재 대기</option>
        <option value="active">유효 권한</option>
        <option value="all">전체</option>
      </select>
      <button className={toolButton} id="run" hidden={run.hidden} disabled={run.disabled} onClick={() => start.mutate("policies")}>
        <Icon name="activity" small /><span id="run-txt">{run.text}</span>
      </button>
      <button className={cn(toolButton, "ml-0")} id="add-user" hidden={ui.view !== "users"} onClick={deselect}><Icon name="plus" small />새 계정</button>
      <button className={cn(toolButton, "ml-0")} id="add-access" hidden={ui.view !== "access"} onClick={deselect}><Icon name="plus" small />권한 등록</button>
    </div>
  );
}
