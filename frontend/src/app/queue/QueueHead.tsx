import { useMe } from "@/app/me";
import { useJobs } from "@/app/data";
import { VIEWS } from "@/app/views";
import { useUi } from "@/app/ui/UiContext";
import type { StageFilter } from "@/app/ui/uiReducer";
import { runButton, useStartJob } from "@/shared/api/jobs";
import { Icon } from "@/shared/ui/Icon";

// 대기열 제목 줄 — 검색 · 결재 단계 거르기 · 실행 버튼. 세 실행 버튼은 빼지 않고 hidden 으로 숨깁니다 (.run + .run 여백 규칙).
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
  const run = runButton(jobs, ui.view);
  return (
    <div className="queue-head">
      <h3 id="queue-title">{title}</h3>
      <label className="search">
        <Icon name="search" className="sm" />
        <input id="q" type="search" placeholder={meta?.search ?? ""} autoComplete="off" value={ui.query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <select id="stage-filter" className="select" aria-label="결재 단계" hidden={ui.view !== "requests"} value={ui.stageFilter}
        onChange={(e) => setStageFilter(e.target.value as StageFilter)}>
        <option value="pending">결재 대기</option>
        <option value="active">유효 권한</option>
        <option value="all">전체</option>
      </select>
      <button className="rerun run" id="run" hidden={run.hidden} disabled={run.disabled} onClick={() => start.mutate("policies")}>
        <Icon name="activity" className="sm" /><span id="run-txt">{run.text}</span>
      </button>
      <button className="rerun run" id="add-user" hidden={ui.view !== "users"} onClick={deselect}><Icon name="plus" className="sm" />새 계정</button>
      <button className="rerun run" id="add-access" hidden={ui.view !== "access"} onClick={deselect}><Icon name="plus" className="sm" />권한 등록</button>
    </div>
  );
}
