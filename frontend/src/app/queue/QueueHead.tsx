import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import type { StageFilter } from "@/app/ui/state/uiReducer";
import { runButton, useStartJob } from "@/shared/api/jobs";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { formMsg, formMsgOk, searchBox, searchInput, toolButton } from "@/shared/ui/base/styles";
import { Periods } from "@/shared/ui/base/parts";
import { useQueue } from "./useQueue";
import { stageCounts } from "./select";

const STAGES: [StageFilter, string][] = [["pending", "결재 대기"], ["active", "유효 권한"], ["all", "전체"]];

// 대기열 제목 줄 — 제목 · 결재함 거르기(제목 옆) · 검색 · 실행 버튼. 버튼은 빼지 않고 hidden 으로 숨깁니다.
// 검색 칸이 오른쪽으로 밀고 버튼은 그 옆에 붙입니다 (버튼도 밀면 남는 자리를 나눠 검색 칸이 가운데로 뜹니다).
export function QueueHead() {
  const me = useMe();
  const { ui, setQuery, setStageFilter, deselect } = useUi();
  const jobs = useJobs();
  const counts = stageCounts(useQueue(), me.role);
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
      {/* 결재함 거르기 — 세 보기를 늘 보이게 두고 건수를 붙입니다 (고르기 칸은 눌러 봐야 다른 보기와 건수를 알 수 있었습니다). */}
      {ui.view === "requests" && (
        <Periods<StageFilter> id="stage-filter" label="결재 단계" value={ui.stageFilter} onChange={setStageFilter}
          labels={STAGES.map(([k, name]) => [k, <>{name}<span className="ml-1.5 tabular-nums text-ink-faint">{counts[k]}</span></>])} />
      )}
      {/* 일반 사용자는 패널이 없어 철회 결과를 여기에 띄웁니다. */}
      {ui.view === "mine" && ui.panelMsg && <span className={cn(ui.panelMsg.startsWith("✓") ? formMsgOk : formMsg, "mr-0")}>{ui.panelMsg}</span>}
      <label className={cn(searchBox, "ml-auto max-w-[320px] flex-[1_1_220px]")}>
        <Icon name="search" small />
        <input id="q" type="search" className={searchInput} placeholder={meta?.search ?? ""} autoComplete="off" value={ui.query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <button className={cn(toolButton, "ml-0")} id="run" hidden={run.hidden} disabled={run.disabled} onClick={() => start.mutate("policies")}>
        <Icon name="activity" small /><span id="run-txt">{run.text}</span>
      </button>
      <button className={cn(toolButton, "ml-0")} id="add-user" hidden={ui.view !== "users"} onClick={deselect}><Icon name="plus" small />새 계정</button>
      <button className={cn(toolButton, "ml-0")} id="add-access" hidden={ui.view !== "access"} onClick={deselect}><Icon name="plus" small />권한 등록</button>
      <button className={cn(toolButton, "ml-0")} id="add-doc" hidden={ui.view !== "docs"} onClick={deselect}><Icon name="plus" small />문서 업로드</button>
    </div>
  );
}
