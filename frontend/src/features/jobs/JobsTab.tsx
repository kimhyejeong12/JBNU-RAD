import { confirmBox } from "@/app/ui/confirm";
import { dayTime } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { DayTime, Pill, CardHead } from "@/shared/ui/parts";
import { cn } from "@/shared/lib/cn";
import { ltable, ltableWrap, ltd, ltdEmpty, lth, note, toolButton, cardCol, cardCountInline, squarePill } from "@/shared/ui/styles";
import { useClearQueue, useQueueDetail, LANE_ROWS, jobIcon, jobName, jobRows, jobTarget, progress, waitingCount, type QueueDetail } from "@/features/jobs/lib";

const ROWS = "m-0 list-none divide-y divide-line border-t border-line p-0";
const ROW = "flex items-center gap-3 px-4.5 py-2.75";
const at = (iso: string | null | undefined) => dayTime(iso).join(" ");

// 왼쪽 작업 큐(실시간), 오른쪽 작업별 실행(예약 · 마지막 실행)
export function JobsTab() {
  const q = useQueueDetail();
  const clear = useClearQueue();
  const d = q.data;

  async function onClear() {
    const message = "모든 작업을 끝내고 큐를 새로 시작합니다.";
    if (await confirmBox({ title: "작업 큐 강제 초기화", confirm: "초기화", danger: true, message })) clear.mutate();
  }

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-3.5 narrow:grid-cols-[minmax(0,1fr)]" id="view-jobs" role="tabpanel" aria-labelledby="tab-jobs">
      <section className={cardCol}>
        <CardHead title="작업 큐">
          <span className={cardCountInline} id="queue-count">{d ? `실행 ${d.current ? 1 : 0}, 대기 ${waitingCount(d)}` : ""}</span>
          <button className={cn(toolButton, "border-risk text-risk")} id="queue-clear" disabled={!d || clear.isPending} onClick={() => void onClear()}>
            <Icon name="warn" small />{clear.isPending ? "초기화하는 중…" : "강제 초기화"}
          </button>
        </CardHead>
        {q.isError ? <p className={cn(note, "mx-4.5 mb-4 text-risk")}>작업 큐를 받지 못했습니다: {q.error.message}</p>
          : d ? <Queue d={d} /> : <p className={cn(note, "mx-4.5 mb-4")}>불러오는 중…</p>}
      </section>
      {d && <Jobs d={d} />}
    </div>
  );
}

// 첫 줄이 지금 도는 작업, 그 아래가 길마다 기다리는 작업임
function Queue({ d }: { d: QueueDetail }) {
  const j = d.current;
  return (
    <div className={ltableWrap}>
      <table className={ltable}>
        <thead><tr><th className={lth}>상태</th><th className={lth}>작업</th><th className={lth}>대상</th><th className={lth}>진행</th><th className={lth}>시각</th></tr></thead>
        <tbody id="queue-waiting">
          {!j && waitingCount(d) === 0 && <tr><td colSpan={5} className={ltdEmpty}>대기 중인 작업이 없습니다</td></tr>}
          {j && (
            <tr>
              <td className={ltd}><Pill tone="border-brand text-brand" className={squarePill}>실행 중</Pill></td>
              <td className={cn(ltd, "font-semibold")}>{jobName(d, j.kind)}{j.auto ? " (자동)" : ""}</td>
              <td className={ltd}>{jobTarget(j)}</td>
              <td className={cn(ltd, "tabular-nums")}>{progress(d, j)}</td>
              <td className={ltd}><DayTime iso={j.started_at} /></td>
            </tr>
          )}
          {d.lanes.flatMap((lane) => [
            ...lane.jobs.slice(0, LANE_ROWS).map((w) => (
              <tr key={w.id}>
                <td className={cn(ltd, "whitespace-nowrap text-ink-dim")}>대기<small className="block text-[11.5px]">{lane.name}</small></td>
                <td className={ltd}>{jobName(d, w.kind)}{w.auto ? " (자동)" : ""}</td>
                <td className={ltd}>{jobTarget(w)}</td>
                <td className={ltd} />
                <td className={ltd}><DayTime iso={w.created_at} /></td>
              </tr>
            )),
            ...(lane.jobs.length > LANE_ROWS
              ? [<tr key={`more-${lane.lane}`}><td colSpan={5} className={ltdEmpty}>{lane.name} 외 {lane.jobs.length - LANE_ROWS}건</td></tr>] : []),
          ])}
        </tbody>
      </table>
    </div>
  );
}

// 작업마다 한 줄 — 간격, 다음 실행, 마지막 실행과 그 결과
function Jobs({ d }: { d: QueueDetail }) {
  const rows = jobRows(d);
  return (
    <section className={cardCol}>
      <CardHead title="작업별 실행" />
      {rows.length === 0 ? <p className={cn(note, "mx-4.5 mb-4")}>예약도 끝난 작업도 없습니다</p> : (
        <ul className={ROWS}>
          {rows.map((r) => (
            <li key={r.kind} className={ROW}>
              {/* 기호는 이름 · 간격 두 줄의 가운데 */}
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <Icon name={jobIcon(r.kind)} small className="flex-none text-ink-soft" />
                <span className="min-w-0">
                  <b className="block truncate text-[13.5px]">{jobName(d, r.kind)}</b>
                  <small className="block text-[12px] text-ink-dim tabular-nums">{r.everyMin ? `${r.everyMin}분마다` : "예약 없음"}</small>
                </span>
              </span>
              <span className="flex flex-col items-end gap-0.5 text-[12px] leading-tight text-ink-dim tabular-nums">
                {r.nextAt && <span>다음 <b className="text-ink">{at(r.nextAt)}</b></span>}
                {r.last && (
                  <span className={cn(r.last.error && "text-risk")} data-tip={r.last.error ?? undefined}>
                    마지막 {at(r.last.finished_at)} {r.last.error ? "실패" : "성공"}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
