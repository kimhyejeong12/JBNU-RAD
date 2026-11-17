import { useMe } from "@/app/session/me";
import { useJobs, useResults } from "@/app/session/data";
import { LEVEL_VIEWS, VIEWS, canManageAccounts } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { NEW_ITEM } from "@/app/ui/state/uiReducer";
import { ask } from "@/app/ui/ask";
import { useQueue } from "./useQueue";
import { levelCounts } from "./select";
import { runButton, useStartJob, busyJob, useResetJobs } from "@/shared/api/jobs";
import { Icon } from "@/shared/ui/Icon";
import { levelText, cardTitle, toolButtonInline } from "@/shared/ui/styles";
import { LevelDot, Tile, SearchBox } from "@/shared/ui/parts";
import { LEVEL_TIP, LEVELS } from "@/shared/lib/labels";

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
  const counted = view && LEVEL_VIEWS.has(view) ? levelCounts(items, view, ui.stageFilter, me.role) : null;
  // 로그 감시는 주의 이상만 목록에 올라와, 정상은 서버가 센 건수만 보임 (누르지 않음)
  // event_levels 가 없는 예전 서버와 붙어도 깨지지 않게 0 으로 둠
  const normal = results.event_levels?.["정상"] ?? 0;
  const byLevel = counted && view === "events" ? { ...counted, "정상": normal, "전체": counted["전체"] + normal } : counted;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="queue-title" className={cardTitle}>{title}</h3>
        <SearchBox className="ml-auto max-w-64 flex-[1_1_200px]" id="q" placeholder={meta?.search ?? ""} value={ui.query} onChange={(e) => setQuery(e.target.value)} />
        <button className={toolButtonInline} id="run" hidden={run.hidden} disabled={run.disabled} onClick={() => start.mutate("policies")}>
          <Icon name="activity" small /><span id="run-txt">{run.text}</span>
        </button>
        {!run.hidden && <JobReset />}
        <button className={toolButtonInline} id="add-user" hidden={ui.view !== "users" || !canManageAccounts(me)} onClick={() => select(NEW_ITEM)}><Icon name="plus" small />새 계정</button>
        <button className={toolButtonInline} id="add-access" hidden={ui.view !== "access"} onClick={() => select(NEW_ITEM)}><Icon name="plus" small />권한 등록</button>
        <button className={toolButtonInline} id="add-doc" hidden={ui.view !== "docs"} onClick={() => select(NEW_ITEM)}><Icon name="plus" small />문서 업로드</button>
      </div>
      {byLevel && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2.5" id="level-filter" role="group" aria-label="AI 판단 등급">
          {/* 처리 방향은 숫자 옆에 — 노트북에서 타일이 높지 않게 함 */}
          <Tile label="전체" big={byLevel["전체"]} className="py-3" pressed={ui.filter === "전체"} onClick={() => setFilter("전체")} />
          {LEVELS.map((l) => {
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

// 모델 서버가 응답하지 않으면 다른 작업이 모두 막혀서 강제 중지를 둠
export function JobReset() {
  const jobs = useJobs();
  const reset = useResetJobs();
  const name = busyJob(jobs);
  if (!name) return null;

  async function onClick() {
    const message = `${name}을(를) 끝내고 처음부터 다시 돌립니다.`;
    if (await ask({ title: "작업 강제 중지", confirm: "다시 돌리기", danger: true, message })) reset.mutate(true);
  }

  return (
    <button className={toolButtonInline} id="job-reset" disabled={reset.isPending} onClick={() => void onClick()}>
      {reset.isPending ? "끝내는 중…" : "다시 돌리기"}
    </button>
  );
}
