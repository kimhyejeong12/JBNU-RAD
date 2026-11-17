import { useMe } from "@/app/session/me";
import { useJobs, useResults } from "@/app/session/data";
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
  const results = useResults();
  const items = useQueue();
  const start = useStartJob();
  const meta = ui.view ? VIEWS[ui.view] : null;
  const title = ui.view === "requests"
    ? `${meta?.label} — ${me.role === "manager" ? "1차" : "최종"} 결재함`
    : meta?.title ?? "현황";
  const run = runButton(jobs, ui.view, start.isPending);
  const view = ui.view;
  const levels: Level[] = ["정상", "주의", "위험"];
  const counted = view && LEVEL_VIEWS.has(view) ? levelCounts(items, view, ui.stageFilter, me.role) : null;
  // 로그 감시는 주의 이상만 목록에 올라와, 정상은 서버가 센 건수만 보입니다 (누르지 않음).
  // event_levels 가 없는 예전 서버와 붙어도 깨지지 않게 0 으로 둡니다.
  const normal = results.event_levels?.["정상"] ?? 0;
  const byLevel = counted && view === "events" ? { ...counted, "정상": normal, "전체": counted["전체"] + normal } : counted;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="queue-title" className="m-0 text-[15.5px] font-bold">{title}</h3>
        <label className={cn(searchBox, "ml-auto max-w-64 flex-[1_1_200px]")}>
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
          {/* 처리 방향은 숫자 옆에 — 노트북에서 타일이 높지 않게 합니다. */}
          <Tile label="전체" big={byLevel["전체"]} className="py-3" pressed={ui.filter === "전체"} onClick={() => setFilter("전체")} />
          {levels.map((l) => {
            const countOnly = view === "events" && l === "정상";
            const note = view === "requests" ? LEVEL_TIP[l] : countOnly ? "목록에 안 올림" : null;
            return (
              <Tile key={l} label={<><LevelDot level={l} />{l}</>} className="py-3" tone={byLevel[l] ? levelText[l] : undefined}
                big={<>{byLevel[l]}{note && <span className="ml-1.5 text-xs font-normal text-ink-dim">{note}</span>}</>}
                {...(countOnly ? {} : { pressed: ui.filter === l, onClick: () => setFilter(ui.filter === l ? "전체" : l) })} />
            );
          })}
        </div>
      )}
    </div>
  );
}
