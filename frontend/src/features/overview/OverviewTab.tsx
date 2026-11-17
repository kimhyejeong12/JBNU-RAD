import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AREA_COLOR, AREA_ICON, PERIODS, arcs, delta, deltaText, firstTodos, ofText, rangeText, rateText, useGo, type Go } from "./lib";
import { useJobs } from "@/app/session/data";
import { StateCell } from "@/app/ui/panel/DecisionFoot";
import { decisionState } from "@/app/ui/panel/decision";
import { useUi } from "@/app/ui/state/UiContext";
import { useStartJob } from "@/shared/api/jobs";
import { overviewQuery } from "@/shared/api/queries";
import type { Briefing, Overview, OverviewRow, StatPeriod } from "@/shared/api/types";
import { niceMax, stamp } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/Icon";
import { usePage } from "@/shared/lib/hooks";
import { DayTime, IconBadge, LevelDot, LevelLabel, Pager, Periods, Tile } from "@/shared/ui/parts";
import { DataTable, Legend } from "@/shared/ui/charts";
import { brandCard, card, cardCount, cardHead, cardTitle, levelText, markTone, toolButton } from "@/shared/ui/styles";

type Open = "위험" | "주의";
const SUB = "m-0 px-4.5 pb-3 text-[12.5px] text-ink-dim";
const AREA_MARK = "inline-block size-2.5 flex-none rounded-xs";

// 위 = 숫자, 가운데 = 그래프와 AI 요약, 아래 = 주요 이슈와 최근 조치. 위험 주의 타일을 누르면 이슈 표를 거릅니다.
export function OverviewTab() {
  const { ui, setStats } = useUi();
  const period = ui.stats.period;
  const q = useQuery(overviewQuery(period));
  const d = q.data;
  const go = useGo();
  const [level, setLevel] = useState<Open | null>(null);
  const rows = d ? (level ? d.top.filter((r) => r.level === level) : d.top) : [];
  const total = d ? (level ? d.counts[level] : d.counts["위험"] + d.counts["주의"]) : 0;
  const title = `${level ? `열린 ${level}` : "주요 위험 이슈"} (${ofText(total, rows.length)})`;
  return (
    <div className="flex flex-col gap-3.5" id="view-overview" role="tabpanel" aria-labelledby="tab-overview" style={{ opacity: q.isFetching && d ? 0.55 : undefined }}>
      <section className={card}>
        <div className={cardHead}>
          <h3 className={cardTitle}>종합 대시보드</h3>
          <Periods<StatPeriod> id="overview-periods" labels={PERIODS} value={period} onChange={(p) => { if (p !== period) setStats({ period: p }); }} />
          <span className={cardCount}>{rangeText(q)}</span>
        </div>
        {d && <Tiles d={d} level={level} onPick={(l) => setLevel(l === level ? null : l)} />}
      </section>
      {d && (
        <>
          <div className="grid grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,4fr)] gap-3.5 narrow:grid-cols-[minmax(0,1fr)]">
            <AreaDonut d={d} />
            <Trend d={d} />
            <Summary b={d.briefing} go={go} />
          </div>
          <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-3.5 narrow:grid-cols-[minmax(0,1fr)]">
            <Issues key={level ?? "all"} id="overview-top" title={title} rows={rows} empty={emptyText(level, total)} go={go} />
            <Recent d={d} go={go} />
          </div>
          {d.failed.length > 0 && <Issues id="overview-failed" title={`판정 실패 ${d.failed.length}`} rows={d.failed} empty="" go={go} />}
        </>
      )}
    </div>
  );
}

// 주요 이슈는 위험부터 10건이라, 위험이 많으면 주의는 열려 있어도 이 목록에 안 들어옵니다.
function emptyText(level: Open | null, total: number): string {
  if (!level) return "열린 위험 없음";
  return total ? `위험이 많아 주요 이슈 10건에 ${level}가 들지 않았습니다` : `열린 ${level} 없음`;
}

// 전체 이슈 = 기간 안에 조치를 끝낸 것 + 지금 남은 것 — 조치 완료율의 분모입니다. 누르면 이슈 표의 거르기를 풉니다.
function Tiles({ d, level, onPick }: { d: Overview; level: Open | null; onPick: (l: Open | null) => void }) {
  const c = d.counts;
  const all = c.completion.done + c.completion.waiting;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 px-4.5 pb-4" id="overview-tiles">
      <Tile label="전체 이슈" big={all} pressed={level === null} onClick={() => onPick(null)}>남음 {c.completion.waiting}, 완료 {c.completion.done}</Tile>
      {(["위험", "주의"] as const).map((l) => (
        <Tile key={l} label={<><LevelDot level={l} />{l}</>} big={c[l]} tone={c[l] ? levelText[l] : undefined} pressed={level === l} onClick={() => onPick(l)}>{deltaText(delta(d.trend, l))}</Tile>
      ))}
      <Tile label="조치 필요" big={c.action.total}>결정 없음 {c.action.undecided}, 조치 중 {c.action.acting}</Tile>
      <Tile label="조치 완료율" big={rateText(c.completion.rate)}>{c.completion.done} / {all}건</Tile>
      {c.failed > 0 && <Tile label="판정 실패" big={c.failed} tone="text-ink-dim">위험 주의에 안 셈</Tile>}
    </div>
  );
}

// 시안처럼 요약 셋 + 우선 조치 권고 — 요약은 AI 비서가 영역마다 낸 맨 앞 할 일(위험부터 셋), 권고는 AI 한 줄 요약입니다.
function Summary({ b, go }: { b: Briefing | null; go: Go }) {
  const jobs = useJobs();
  const start = useStartJob();
  const busy = start.isPending || jobs?.running === "briefing";
  return (
    <section className={cn(card, brandCard)} id="overview-briefing">
      <div className={cardHead}>
        <h3 className={cn(cardTitle, "flex items-center gap-1.5")}><Icon name="bot" />AI 종합 분석 요약</h3>
        {b && <span className="text-[12px] text-ink-dim tabular-nums">{stamp(b.created_at)}</span>}
        <button className={cn(toolButton, "p-1.5")} id="briefing-run" disabled={busy} aria-label="다시 정리" data-tip="다시 정리"
          onClick={() => start.mutate("briefing")}>
          <Icon name="refresh" small className={busy ? "animate-spin" : undefined} />
        </button>
      </div>
      {!b ? <p className={SUB}>작업 처리 중, 잠시 기다려 주세요</p> : b.failed ? <p className={cn(SUB, "text-risk")}>정리 실패: {b.error}</p> : (
        <div className="flex flex-col gap-2.5 px-4.5 pb-4">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {firstTodos(b).map((t) => (
              <li key={`${t.area}:${t.item}`}>
                <button onClick={() => go(t.area, t.key)} data-tip={`${t.label}, ${t.subject}|${t.why}`}
                  className="flex w-full items-baseline rounded-md border-none bg-transparent px-1.5 py-1 text-left text-[13px] leading-[1.5] hover:bg-surface">
                  <LevelDot level={t.level} /><span className="line-clamp-2">{t.task}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="m-0 flex items-start gap-1.5 rounded-lg bg-surface px-3 py-2 text-[13px] font-semibold">
            <Icon name="bulb" small className="mt-0.75 text-ink-dim" />
            <span><span className="mr-1.5 text-[12px] text-ink-dim">우선 조치 권고</span>{b.headline}</span>
          </p>
        </div>
      )}
    </section>
  );
}

const R = 52;
const C = 2 * Math.PI * R;
const GAP = 2;

function AreaDonut({ d }: { d: Overview }) {
  const { total, arcs: parts } = arcs(d.areas);
  return (
    <section className={card} id="overview-areas">
      <div className={cardHead}><h3 className={cardTitle}>위험 유형별 현황</h3></div>
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
              <i className={AREA_MARK} style={{ background: AREA_COLOR[a.area] }} />
              <span className="flex-1">{a.label}</span>
              <span className="tabular-nums text-ink-dim">위험 <b className="text-ink">{a["위험"]}</b>, 주의 <b className="text-ink">{a["주의"]}</b></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const SERIES = ["위험", "주의"] as const;
const LINE: Record<Open, string> = { "위험": "var(--color-risk)", "주의": "var(--color-warn)" };
const TICK = "absolute top-1 -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full";
// 이 날 수까지는 날마다 점을 찍고, 넘으면 점이 겹쳐 마지막 날과 가리킨 날에만 찍습니다.
const DOT_DAYS = 14;

// 그날 끝에 남은 위험 주의 — 선 둘, 가리킨 날은 세로선과 값.
function Trend({ d }: { d: Overview }) {
  const days = d.trend;
  const max = niceMax(Math.max(1, ...days.flatMap((x) => [x["위험"], x["주의"]])));
  const ticks = [...new Set([0, Math.floor(days.length / 2), days.length - 1])].filter((n) => n >= 0);
  const at = (n: number) => ((n + 0.5) / days.length) * 100;
  const line = (k: Open) => days.map((x, n) => `${at(n) * 10},${100 - (x[k] / max) * 100}`).join(" ");
  const last = days[days.length - 1];
  return (
    <section className={card} id="overview-trend">
      <div className={cardHead}>
        <h3 className={cardTitle}>위험 주의 추이</h3>
        <Legend round className="ml-auto p-0" items={[["위험", "위험"], ["주의", "주의"]]} />
      </div>
      {!last ? <p className={SUB}>기록 없음</p> : (
        <>
          <div className="px-4.5 pt-1 pb-1.5">
            <div className="relative ml-7.5 h-32 border-b border-line" role="img" aria-label={`일별 위험 주의 (그날 끝에 남은 것), ${last.day} 위험 ${last["위험"]}, 주의 ${last["주의"]}`}>
              {[max, Math.round(max / 2)].map((v) => <span key={v} className="absolute -left-7.5 right-0 border-t border-line text-[10.5px] text-ink-dim tabular-nums" style={{ bottom: `${(v / max) * 100}%` }}><span className="absolute -top-1.75 left-0 w-6.5 bg-surface text-right">{v}</span></span>)}
              <svg className="absolute inset-0 size-full" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon points={`${at(0) * 10},100 ${line("위험")} ${at(days.length - 1) * 10},100`} fill={LINE["위험"]} fillOpacity={0.1} />
                {SERIES.map((k) => <polyline key={k} points={line(k)} fill="none" stroke={LINE[k]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
              </svg>
              <div className="absolute inset-0 flex">
                {days.map((x, n) => (
                  <span key={x.day} className="group relative flex-[1_1_0] outline-offset-2" tabIndex={0} data-tip={`${x.day}|위험 ${x["위험"]}, 주의 ${x["주의"]}`}>
                    <i className="absolute inset-y-0 left-1/2 w-px bg-ink-dim opacity-0 group-hover:opacity-40 group-focus:opacity-40" />
                    {SERIES.map((k) => (
                      <i key={k} style={{ bottom: `${(x[k] / max) * 100}%` }}
                        className={cn("absolute left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-surface", markTone[k],
                          days.length > DOT_DAYS && n < days.length - 1 && "opacity-0 group-hover:opacity-100 group-focus:opacity-100")} />
                    ))}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative ml-7.5 h-4.5 text-[11px] text-ink-dim tabular-nums">
              {ticks.map((n, i) => <span key={n} className={TICK} style={{ left: i === 0 ? "0" : i === ticks.length - 1 ? "100%" : `${at(n)}%` }}>{days[n].day}</span>)}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// 표는 한 쪽 5줄 — 10줄을 다 펼치면 화면이 길어져 쪽으로 넘깁니다.
const PAGE = 5;

function Issues({ id, title, rows, empty, go }: { id: string; title: string; rows: OverviewRow[]; empty: string; go: Go }) {
  const { shown, at, pages, setPage } = usePage(rows, PAGE);
  return (
    <section className={card} id={id}>
      <div className={cardHead}><h3 className={cardTitle}>{title}</h3></div>
      <DataTable head={["발생일", "유형", "대상, 내용", "AI 판단", "처리 상태"]} empty={empty}
        rows={shown.map((r) => ({
          key: `${r.area}:${r.key}`, onSelect: () => go(r.area, r.key),
          cells: [
            <DayTime key="o" iso={r.opened_at} />,
            <Area key="a" area={r.area} label={r.area_label} />,
            <Content key="c" subject={r.subject} note={r.reason} />,
            r.level ? <LevelLabel key="l" level={r.level} /> : <span key="l" className="text-ink-dim">판정 실패</span>,
            <StateCell key="d" {...decisionState(r.decision)} by={r.decision?.by} />,
          ],
        }))} />
      {pages > 1 && <Pager className="py-3" at={at} pages={pages} onPage={setPage} />}
    </section>
  );
}


// 최근 조치 — 완료율의 "완료"로 센 것 (조치 완료 결정 · 회수), 늦은 것부터 10건. recent 가 없는 예전 서버에서도 깨지지 않게 합니다.
function Recent({ d, go }: { d: Overview; go: Go }) {
  const rows = d.recent ?? [];
  const { shown, at, pages, setPage } = usePage(rows, PAGE);
  return (
    <section className={card} id="overview-recent">
      <div className={cardHead}><h3 className={cardTitle}>최근 조치 내역 ({ofText(d.counts.completion.done, rows.length)})</h3></div>
      <DataTable head={["처리일", "유형", "대상, 조치 내용", "결과"]} empty="기간 안 조치 없음"
        rows={shown.map((r) => ({
          key: `${r.area}:${r.key}:${r.at}`, onSelect: () => go(r.area, r.key),
          cells: [
            <DayTime key="t" iso={r.at} />,
            <Area key="a" area={r.area} label={r.area_label} />,
            <Content key="c" subject={r.subject} note={r.note} />,
            <StateCell key="l" text={r.label} tone={DONE_TONE} by={r.by} />,
          ],
        }))} />
      {pages > 1 && <Pager className="py-3" at={at} pages={pages} onPage={setPage} />}
    </section>
  );
}

// 조치 완료 · 회수 모두 끝난 일이라 검토 현황의 "조치 완료" 배지 색을 씁니다.
const DONE_TONE = decisionState({ action: "done" }).tone;

// 유형 — 메뉴 기호와 이름을 회색 배지로 묶어 내용 글과 나눕니다.
function Area({ area, label }: { area: OverviewRow["area"]; label: string }) {
  return <IconBadge icon={AREA_ICON[area]}>{label}</IconBadge>;
}

// 내용 — 대상(굵게) 위, 이유 · 의견(회색) 아래 한 줄씩, 전체 글은 툴팁
function Content({ subject, note }: { subject: string; note?: string }) {
  return (
    <span className="block min-w-0" data-tip={note ? `${subject}|${note}` : undefined}>
      <b className="line-clamp-1">{subject}</b>
      {note && <small className="line-clamp-1 text-[12px] text-ink-dim">{note}</small>}
    </span>
  );
}
