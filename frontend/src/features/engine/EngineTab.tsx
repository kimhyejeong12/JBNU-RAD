import { ask } from "@/app/ui/confirm/ask";
import { stamp } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/base/Icon";
import { DayTime } from "@/shared/ui/base/parts";
import { cn } from "@/shared/lib/cn";
import { card, cardCount, cardHead, cardTitle, ltable, ltableWrap, ltd, ltdEmpty, lth, note, toolButton } from "@/shared/ui/base/styles";
import { useClearQueue, useQueueDetail } from "./api";
import { LANE_ROWS, jobIcon, jobName, jobTarget, lastRows, progress, waitingCount, type QueueDetail } from "./lib";

const section = cn(card, "flex flex-col");
const ROWS = "m-0 list-none divide-y divide-line border-t border-line p-0";
const ROW = "flex items-center gap-3 px-4.5 py-2.75";
const ICON_BOX = "flex size-8 flex-none items-center justify-center rounded-lg bg-canvas text-ink-soft";

export function EngineTab() {
  const q = useQueueDetail();
  const clear = useClearQueue();
  const d = q.data;

  async function onClear() {
    const message = "모든 작업을 끝내고 큐를 새로 시작합니다.";
    if (await ask({ title: "작업 큐 강제 초기화", confirm: "초기화", danger: true, message })) clear.mutate();
  }

  // 왼쪽 = 지금 도는 것 · 기다리는 것(실시간), 오른쪽 = 예약 · 마지막 실행(시스템이 어떻게 도는지).
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-3.5 narrow:grid-cols-[minmax(0,1fr)]" id="view-engine" role="tabpanel" aria-labelledby="tab-engine">
      <div className="flex min-w-0 flex-col gap-3.5">
      <section className={section}>
        <div className={cardHead}>
          <h3 className={cardTitle}>작업 큐</h3>
          <span className={cn(cardCount, "ml-0")} id="queue-count">{d ? `실행 ${d.current ? 1 : 0}, 대기 ${waitingCount(d)}` : ""}</span>
          <button className={cn(toolButton, "border-risk text-risk")} id="queue-clear" disabled={!d || clear.isPending} onClick={() => void onClear()}>
            <Icon name="warn" small />{clear.isPending ? "초기화하는 중…" : "강제 초기화"}
          </button>
        </div>
        {q.isError ? <p className={cn(note, "mx-4.5 mb-4 text-risk")}>작업 큐를 받지 못했습니다: {q.error.message}</p>
          : d ? <Current d={d} /> : <p className={cn(note, "mx-4.5 mb-4")}>불러오는 중…</p>}
      </section>
      {d && <Waiting d={d} />}
      </div>
      <div className="flex min-w-0 flex-col gap-3.5">
        {d && <Schedule d={d} />}
        {d && <Last d={d} />}
      </div>
    </div>
  );
}

function Current({ d }: { d: QueueDetail }) {
  const j = d.current;
  return (
    <div className={ltableWrap}>
      <table className={ltable}>
        <thead><tr><th className={lth}>지금 도는 작업</th><th className={lth}>대상</th><th className={lth}>진행</th><th className={lth}>시작</th></tr></thead>
        <tbody>
          {j ? (
            <tr>
              <td className={cn(ltd, "font-semibold")}>{jobName(d, j.kind)}{j.auto ? " (자동)" : ""}</td>
              <td className={ltd}>{jobTarget(j)}</td>
              <td className={cn(ltd, "tabular-nums")}>{progress(d, j)}</td>
              <td className={cn(ltd, "tabular-nums")}>{stamp(j.started_at)}</td>
            </tr>
          ) : <tr><td colSpan={4} className={ltdEmpty}>쉬는 중입니다</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Waiting({ d }: { d: QueueDetail }) {
  return (
    <section className={section}>
      <div className={cardHead}><h3 className={cardTitle}>기다리는 작업</h3><span className={cardCount}>{waitingCount(d)}건</span></div>
      <div className={ltableWrap}>
        <table className={ltable}>
          <thead><tr><th className={lth}>길</th><th className={lth}>작업</th><th className={lth}>대상</th><th className={lth}>들어온 시각</th></tr></thead>
          <tbody id="queue-waiting">
            {waitingCount(d) === 0 && <tr><td colSpan={4} className={ltdEmpty}>기다리는 작업이 없습니다</td></tr>}
            {d.lanes.flatMap((lane) => [
              ...lane.jobs.slice(0, LANE_ROWS).map((j) => (
                <tr key={j.id}>
                  <td className={cn(ltd, "whitespace-nowrap text-ink-dim")}>{lane.name}</td>
                  <td className={ltd}>{jobName(d, j.kind)}{j.auto ? " (자동)" : ""}</td>
                  <td className={ltd}>{jobTarget(j)}</td>
                  <td className={cn(ltd, "tabular-nums")}>{stamp(j.created_at)}</td>
                </tr>
              )),
              ...(lane.jobs.length > LANE_ROWS
                ? [<tr key={`more-${lane.lane}`}><td colSpan={4} className={ltdEmpty}>{lane.name} 외 {lane.jobs.length - LANE_ROWS}건</td></tr>] : []),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Schedule({ d }: { d: QueueDetail }) {
  const rows = Object.entries(d.schedule);
  return (
    <section className={section}>
      <div className={cardHead}><h3 className={cardTitle}>자동 실행 예약</h3><span className={cardCount}>다음 실행</span></div>
      {rows.length === 0 ? <p className={cn(note, "mx-4.5 mb-4")}>예약이 없습니다</p> : (
        <ul className={ROWS}>
          {rows.map(([kind, s]) => (
            <li key={kind} className={ROW}>
              <span className={ICON_BOX}><Icon name={jobIcon(kind)} small /></span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px]">{jobName(d, kind)}</b>
                <small className="text-[12px] text-ink-dim tabular-nums">{s.every_min}분마다</small>
              </span>
              <DayTime iso={s.next_at} className="items-end" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Last({ d }: { d: QueueDetail }) {
  const rows = lastRows(d);
  return (
    <section className={section}>
      <div className={cardHead}><h3 className={cardTitle}>마지막 실행</h3><span className={cardCount}>끝난 시각</span></div>
      {rows.length === 0 ? <p className={cn(note, "mx-4.5 mb-4")}>뜬 뒤 끝난 작업이 없습니다</p> : (
        <ul className={ROWS}>
          {rows.map(([kind, l]) => (
            <li key={kind} className={ROW}>
              <span className={ICON_BOX}><Icon name={jobIcon(kind)} small /></span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px]">{jobName(d, kind)}</b>
                <small className={cn("block truncate text-[12px]", l.error ? "text-risk" : "text-ok")} data-tip={l.error ?? undefined}>
                  {l.error ? "실패" : "성공"}{l.auto ? ", 자동" : ""}
                </small>
              </span>
              <DayTime iso={l.finished_at} className="items-end" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
