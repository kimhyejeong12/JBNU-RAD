import type { ReactNode } from "react";
import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { LEVEL_VIEWS, VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { JobReset } from "@/app/ui/jobs/JobReset";
import { NEW_ITEM, type LevelFilter } from "@/app/ui/state/uiReducer";
import { runButton, useStartJob } from "@/shared/api/jobs";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { searchBox, searchInput, toolButton } from "@/shared/ui/base/styles";
import { LevelDot, Periods } from "@/shared/ui/base/parts";
import { LEVEL_TIP } from "@/shared/lib/labels";
import type { Level } from "@/shared/api/types";
import { useQueue } from "./useQueue";
import { levelCounts } from "./select";

// 버튼도 밀면 남는 자리를 나눠 검색 칸이 가운데로 뜨므로 검색 칸만 오른쪽으로 밉니다.
const Count = ({ n }: { n: number }) => <span className="ml-1.5 tabular-nums text-ink-faint">{n}</span>;

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
        <button className={cn(toolButton, "ml-0")} id="add-doc" hidden={ui.view !== "docs" || me.role !== "top"} onClick={() => select(NEW_ITEM)}><Icon name="plus" small />문서 업로드</button>
      </div>
      {byLevel && (
        <div className="flex flex-wrap items-center gap-2">
          <Periods<LevelFilter> id="level-filter" label="AI 판정 등급" value={ui.filter} onChange={setFilter}
            labels={[["전체", <>전체<Count n={byLevel["전체"]} /></>], ...levels.map((l): [LevelFilter, ReactNode] => [l, <span key={l} data-tip={LEVEL_TIP[l]}><LevelDot level={l} />{l}<Count n={byLevel[l]} /></span>])]} />
        </div>
      )}
    </div>
  );
}
