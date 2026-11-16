import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { LEVEL_VIEWS, VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { JobReset } from "@/app/ui/jobs/JobReset";
import { NEW_ITEM } from "@/app/ui/state/uiReducer";
import { runButton, useStartJob } from "@/shared/api/jobs";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { levelText, searchBox, searchInput, toolButton } from "@/shared/ui/base/styles";
import { LevelDot, Tile } from "@/shared/ui/base/parts";
import { LEVEL_TIP } from "@/shared/lib/labels";
import type { Level } from "@/shared/api/types";
import { useQueue } from "./useQueue";
import { levelCounts } from "./select";


export function QueueHead() {
  const me = useMe();
  const { ui, setQuery, setFilter, select } = useUi();
  const jobs = useJobs();
  const items = useQueue();
  const start = useStartJob();
  const meta = ui.view ? VIEWS[ui.view] : null;
  const title = ui.view === "requests"
    ? `${meta?.label} — ${me.role === "manager" ? "1차" : "최종"} 결재함`
    : meta?.title ?? "현황";
  const run = runButton(jobs, ui.view, start.isPending);
  const view = ui.view;
  // 로그 감시는 주의 이상만 올라와 정상 버튼을 두지 않습니다.
  const levels: Level[] = view === "events" ? ["주의", "위험"] : ["정상", "주의", "위험"];
  const byLevel = view && LEVEL_VIEWS.has(view) ? levelCounts(items, view, ui.stageFilter, me.role) : null;
  return (
    <div className="flex flex-col gap-2.5 px-4.5 pt-4 pb-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="queue-title" className="m-0 text-[15.5px] font-bold">{title}</h3>
        <label className={cn(searchBox, "ml-auto max-w-[320px] flex-[1_1_220px]")}>
          <Icon name="search" small />
          <input id="q" type="search" className={searchInput} placeholder={meta?.search ?? ""} autoComplete="off" value={ui.query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className={cn(toolButton, "ml-0")} id="run" hidden={run.hidden} disabled={run.disabled} onClick={() => start.mutate("policies")}>
          <Icon name="activity" small /><span id="run-txt">{run.text}</span>
        </button>
        {!run.hidden && <JobReset />}
        <button className={cn(toolButton, "ml-0")} id="add-user" hidden={ui.view !== "users"} onClick={() => select(NEW_ITEM)}><Icon name="plus" small />새 계정</button>
        <button className={cn(toolButton, "ml-0")} id="add-access" hidden={ui.view !== "access"} onClick={() => select(NEW_ITEM)}><Icon name="plus" small />권한 등록</button>
        <button className={cn(toolButton, "ml-0")} id="add-doc" hidden={ui.view !== "docs"} onClick={() => select(NEW_ITEM)}><Icon name="plus" small />문서 업로드</button>
      </div>
      {byLevel && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2.5" id="level-filter" role="group" aria-label="AI 판단 등급">
          <Tile label="전체" big={byLevel["전체"]} pressed={ui.filter === "전체"} onClick={() => setFilter("전체")} />
          {levels.map((l) => (
            <Tile key={l} label={<><LevelDot level={l} />{l}</>} big={byLevel[l]} tone={byLevel[l] ? levelText[l] : undefined}
              pressed={ui.filter === l} onClick={() => setFilter(ui.filter === l ? "전체" : l)}>
              {view === "requests" ? LEVEL_TIP[l] : null}
            </Tile>
          ))}
        </div>
      )}
    </div>
  );
}
