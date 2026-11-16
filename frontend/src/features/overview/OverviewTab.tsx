import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AREA_COLOR, PERIODS, arcs, rateText } from "./lib";
import { useGo, type Go } from "./useGo";
import { useJobs } from "@/app/session/data";
import { DecisionBadge } from "@/app/ui/panel/DecisionFoot";
import { useUi } from "@/app/ui/state/UiContext";
import { useStartJob } from "@/shared/api/jobs";
import { overviewQuery } from "@/shared/api/queries";
import type { Briefing, Overview, OverviewRow, StatPeriod } from "@/shared/api/types";
import { niceMax, stamp } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { LevelDot, Periods } from "@/shared/ui/base/parts";
import { DataTable, Legend, ViewSwitch } from "@/shared/ui/charts/parts";
import { card, cardCount, cardHead, cardTitle, levelText, mark, markTone, note, toolButton } from "@/shared/ui/base/styles";

const SUB = "m-0 px-4.5 pb-3 text-[12.5px] text-ink-dim";
const LABEL = "text-[12px] font-semibold text-ink-dim";

export function OverviewTab() {
  const { ui, setStats } = useUi();
  const period = ui.stats.period;
  const q = useQuery(overviewQuery(period));
  const d = q.data;
  const go = useGo();
  const range = q.isFetching ? "세는 중…" : q.isError ? q.error.message : d ? (d.since ? `완료율 ${stamp(d.since)} 부터` : "완료율 처음부터") : "";
  return (
    <div className="flex flex-col gap-3.5" id="view-overview" role="tabpanel" aria-labelledby="tab-overview" style={{ opacity: q.isFetching && d ? 0.55 : undefined }}>
      <section className={card}>
        <div className={cardHead}>
          <h3 className={cardTitle}>종합</h3>
          <Periods<StatPeriod> id="overview-periods" labels={PERIODS} value={period} onChange={(p) => { if (p !== period) setStats({ period: p }); }} />
          <span className={cardCount}>{range}</span>
        </div>
        {d && <Tiles d={d} />}
      </section>
      {d && (
        <>
          <Assistant b={d.briefing} go={go} />
          <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-3.5 narrow:grid-cols-[minmax(0,1fr)]">
            <AreaDonut d={d} />
            <Trend d={d} />
          </div>
          <Issues id="overview-top" title="주요 위험 이슈" rows={d.top} empty="열린 위험 없음" go={go} />
          {d.failed.length > 0 && <Issues id="overview-failed" title={`판정 실패 ${d.failed.length}`} rows={d.failed} empty="" go={go} />}
        </>
      )}
    </div>
  );
}

const TILE = "flex min-w-0 flex-col gap-0.5 rounded-[10px] border border-line px-3.5 py-3 text-left";

// onClick 을 주면 누르는 타일입니다 — pressed 는 아래 목록을 이 타일로 거르는 중인지.
export function Tile({ label, big, tone, onClick, pressed, children }: {
  label: string; big: ReactNode; tone?: string; onClick?: () => void; pressed?: boolean; children?: ReactNode;
}) {
  const body = (
    <>
      <span className={LABEL}>{label}</span>
      <span className={cn("text-[26px] font-extrabold tracking-[-0.6px] tabular-nums", tone)}>{big}</span>
      <span className={cn(note, "m-0")}>{children}</span>
    </>
  );
  if (!onClick) return <div className={TILE}>{body}</div>;
  return <button type="button" className={cn(TILE, "bg-surface hover:bg-row-hover aria-pressed:border-ink")} aria-pressed={pressed} onClick={onClick}>{body}</button>;
}

function Tiles({ d }: { d: Overview }) {
  const c = d.counts;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 px-4.5 pb-4" id="overview-tiles">
      <Tile label="위험" big={c["위험"]} tone={c["위험"] ? levelText["위험"] : undefined}>지금 열린 것</Tile>
      <Tile label="주의" big={c["주의"]} tone={c["주의"] ? levelText["주의"] : undefined}>지금 열린 것</Tile>
      <Tile label="조치 필요" big={c.action.total}>결정 없음 {c.action.undecided}, 조치 중 {c.action.acting}</Tile>
      <Tile label="조치 완료율" big={rateText(c.completion.rate)}>완료 {c.completion.done}, 남음 {c.completion.waiting}</Tile>
      {c.failed > 0 && <Tile label="판정 실패" big={c.failed} tone="text-ink-dim">위험 주의에 안 셈</Tile>}
    </div>
  );
}

function Assistant({ b, go }: { b: Briefing | null; go: Go }) {
  const jobs = useJobs();
  const start = useStartJob();
  const busy = start.isPending || jobs?.running === "briefing";
  return (
    <section className={card} id="overview-briefing">
      <div className={cardHead}>
        <h3 className={cardTitle}>AI 비서</h3>
        {b && !b.current && !busy && <span className="rounded-full border border-warn-line bg-warn-tint px-2 py-0.25 text-[11.5px] font-bold text-warn-ink">그 뒤 바뀜</span>}
        <span className={cardCount}>{busy ? "정리 중…" : b ? stamp(b.created_at) : ""}</span>
        <button className={cn(toolButton, "ml-0")} id="briefing-run" disabled={busy} onClick={() => start.mutate("briefing")}>
          <Icon name="activity" small />강제 새로고침
        </button>
      </div>
      {!b ? <p className={SUB}>작업 처리 중, 잠시 기다려 주세요</p> : b.failed ? <p className={cn(SUB, "text-risk")}>정리 실패: {b.error}</p> : (
        <>
          <p className="m-0 px-4.5 pb-3 text-[15px] font-bold">{b.headline}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5 px-4.5 pb-4">
            {b.areas.map((a) => (
              <div key={a.area} className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-line px-3.5 py-3">
                <span className="flex items-center gap-1.5 text-[13px] font-bold">
                  <i className="inline-block size-2.5 rounded-xs" style={{ background: AREA_COLOR[a.area] }} />{a.label}
                </span>
                {a.todos.length ? a.todos.map((t) => (
                  <button key={t.item} onClick={() => go(a.area, t.key)}
                    className="flex min-w-0 flex-col gap-0.5 rounded-lg border-none bg-canvas px-2.75 py-2 text-left hover:bg-row-hover">
                    <span className="text-[13px] font-semibold"><LevelDot level={t.level} />{t.task}</span>
                    <span className="truncate text-[11.5px] text-ink-dim">{t.subject}, {t.why}</span>
                  </button>
                )) : <span className="text-[12px] text-ink-dim">할 일 없음</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const R = 52;
const C = 2 * Math.PI * R;
const GAP = 2;

export function AreaDonut({ d }: { d: Overview }) {
  const [table, setTable] = useState(false);
  const { total, arcs: parts } = arcs(d.areas);
  return (
    <section className={card} id="overview-areas">
      <div className={cardHead}><h3 className={cardTitle}>영역별 위험 주의</h3>
        <span className="ml-auto"><ViewSwitch id="overview-areas-view" table={table} onChange={setTable} /></span></div>
      {table ? (
        <DataTable head={["영역", "위험", "주의", "판정 실패"]} empty="" numCols={[1, 2, 3]}
          rows={d.areas.map((a) => ({ key: a.area, cells: [a.label, a["위험"], a["주의"], a.failed] }))} />
      ) : (
        <div className="flex flex-wrap items-center gap-5 px-4.5 pb-4">
          <svg viewBox="0 0 140 140" className="size-35 flex-none" role="img" aria-label={`영역별 열린 위험 주의 ${total}건`}>
            <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-canvas)" strokeWidth="18" />
            {parts.map((a) => {
              const len = (a.end - a.start) * C - (parts.length > 1 ? GAP : 0);
              return (
                <circle key={a.area} cx="70" cy="70" r={R} fill="none" stroke={AREA_COLOR[a.area]} strokeWidth="18" transform="rotate(-90 70 70)"
                  strokeDasharray={`${Math.max(len, 0.5)} ${C}`} strokeDashoffset={-a.start * C} className="hover:brightness-[1.1]"
                  data-tip={`${a.label}|${a.value}건`} />
              );
            })}
            <text x="70" y="68" textAnchor="middle" className="fill-ink text-[24px] font-extrabold tabular-nums">{total}</text>
            <text x="70" y="88" textAnchor="middle" className="fill-ink-dim text-[11px]">열린 것</text>
          </svg>
          <ul className="m-0 flex min-w-40 flex-1 list-none flex-col gap-1.5 p-0 text-[13px]">
            {d.areas.map((a) => (
              <li key={a.area} className="flex items-center gap-2">
                <i className="inline-block size-2.5 flex-none rounded-xs" style={{ background: AREA_COLOR[a.area] }} />
                <span className="flex-1">{a.label}</span>
                <span className="tabular-nums text-ink-dim">위험 <b className="text-ink">{a["위험"]}</b>, 주의 <b className="text-ink">{a["주의"]}</b></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const TICK = "absolute top-1 -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full";

export function Trend({ d }: { d: Overview }) {
  const [table, setTable] = useState(false);
  const days = d.trend;
  const max = niceMax(Math.max(1, ...days.map((x) => x["위험"] + x["주의"])));
  const ticks = [...new Set([0, Math.floor(days.length / 2), days.length - 1])].filter((n) => n >= 0);
  const at = (n: number) => `${((n + 0.5) / days.length) * 100}%`;
  return (
    <section className={card} id="overview-trend">
      <div className={cardHead}><h3 className={cardTitle}>일별 위협</h3>
        <span className="ml-auto"><ViewSwitch id="overview-trend-view" table={table} onChange={setTable} /></span></div>
      {!days.length ? <p className={SUB}>기록 없음</p> : table ? (
        <DataTable scroll head={["날짜", "위험", "주의"]} empty="" numCols={[1, 2]}
          rows={days.map((x) => ({ key: x.day, cells: [x.day, x["위험"], x["주의"]] }))} />
      ) : (
        <>
          <div className="px-4.5 pt-1 pb-1.5">
            <div className="relative ml-7.5 flex h-35 items-end gap-0.5 border-b border-line" role="img" aria-label="일별 위협 (그날 끝에 남은 위험 주의)">
              {[1, 0.5].map((f) => <span key={f} className="absolute -left-7.5 right-0 border-t border-line text-[10.5px] text-ink-dim tabular-nums" style={{ bottom: `${f * 100}%` }}><span className="absolute -top-1.75 left-0 w-6.5 bg-surface text-right">{Math.round(max * f)}</span></span>)}
              {days.map((x) => (
                <span key={x.day} className="group relative z-1 flex h-full flex-[1_1_0] justify-center outline-offset-2" tabIndex={0} data-tip={`${x.day}|위험 ${x["위험"]}, 주의 ${x["주의"]}`}>
                  <span className="flex h-full w-full max-w-6 flex-col-reverse gap-0.5">
                    {(["위험", "주의"] as const).filter((k) => x[k]).map((k) => (
                      <span key={k} className={cn(mark, markTone[k], "last:rounded-t-sm group-hover:brightness-[1.12] group-focus:brightness-[1.12]")} style={{ height: `${(x[k] / max) * 100}%` }} />
                    ))}
                  </span>
                </span>
              ))}
            </div>
            <div className="relative ml-7.5 h-4.5 text-[11px] text-ink-dim tabular-nums">
              {ticks.map((n, i) => <span key={n} className={TICK} style={{ left: i === 0 ? "0" : i === ticks.length - 1 ? "100%" : at(n) }}>{days[n].day}</span>)}
            </div>
          </div>
          <Legend items={[["위험", "위험"], ["주의", "주의"]]} />
        </>
      )}
    </section>
  );
}

export function Issues({ id, title, rows, empty, go }: { id: string; title: string; rows: OverviewRow[]; empty: string; go: Go }) {
  return (
    <section className={card} id={id}>
      <div className={cardHead}><h3 className={cardTitle}>{title}</h3></div>
      <DataTable head={["영역", "대상", "AI 판단", "처리 상태", "이유", "열린 날"]} empty={empty}
        rows={rows.map((r) => ({
          key: `${r.area}:${r.key}`, onSelect: () => go(r.area, r.key),
          cells: [
            <span key="a" className="flex items-center gap-1.5 whitespace-nowrap"><i className="inline-block size-2.5 flex-none rounded-xs" style={{ background: AREA_COLOR[r.area] }} />{r.area_label}</span>,
            <b key="s" className="whitespace-nowrap">{r.subject}</b>,
            r.level ? <span key="l" className={cn("whitespace-nowrap font-semibold", levelText[r.level])}><LevelDot level={r.level} />{r.level}</span> : <span key="l" className="text-ink-dim">판정 실패</span>,
            <DecisionBadge key="d" decision={r.decision} />,
            <span key="r" className="line-clamp-2 text-ink-soft" data-tip={r.reason}>{r.reason}</span>,
            <span key="o" className="whitespace-nowrap text-ink-dim tabular-nums">{stamp(r.opened_at)}</span>,
          ],
        }))} />
    </section>
  );
}

