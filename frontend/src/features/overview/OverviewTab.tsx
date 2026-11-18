import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AREA_COLOR, AREA_ICON, arcs, delta, deltaText, firstTodos, ofText, rateText, useGo, type Go } from "./lib";
import { useJobs } from "@/app/session/data";
import { DecisionCell, StateCell } from "@/app/ui/panel/DecisionFoot";
import { decisionState } from "@/app/ui/panel/decision";
import { useUi } from "@/app/ui/state/UiContext";
import { useStartJob } from "@/shared/api/jobs";
import { overviewQuery } from "@/shared/api/queries";
import type { Briefing, Overview, OverviewRow, StatPeriod } from "@/shared/api/types";
import { dayTime, niceMax, slotAt, stamp } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/Icon";
import { usePage } from "@/shared/lib/hooks";
import { LevelDot, LevelLabel, Pager, Periods, Tile, TwoLine, CardHead } from "@/shared/ui/parts";
import { DataTable, Legend, XTicks, YGrid } from "@/shared/ui/charts";
import { card, cardCount, levelText, markTone, toolButton, cardNote, tileGrid } from "@/shared/ui/styles";
import { STAT_PERIODS } from "@/shared/lib/labels";

type Open = "위험" | "주의";
type Pick = Open | "판정 실패";
const SUB = cn(cardNote, "pb-3");
const AREA_MARK = "inline-block size-2.5 flex-none rounded-xs";

// 위 = 숫자, 가운데 = 그래프와 AI 요약, 아래 = 주요 이슈와 최근 조치. 위험 · 주의 · 판정 실패 타일을 누르면 이슈 표가 그것만 보임
export function OverviewTab() {
  const { ui, setStats } = useUi();
  const period = ui.stats.period;
  // 기간은 완료율 · 추이 · 최근 조치에만 — 날짜 축이 없는 완료율 · 최근 조치 이름에 붙임
  const span = STAT_PERIODS.find(([k]) => k === period)?.[1] ?? "";
  const q = useQuery(overviewQuery(period));
  const d = q.data;
  const go = useGo();
  const [level, setLevel] = useState<Pick | null>(null);
  const { rows, total, name } = d ? picked(d, level) : { rows: [], total: 0, name: "" };
  const title = `${name} (${ofText(total, rows.length)})`;
  return (
    <div className={cn("flex flex-col gap-3.5", q.isFetching && d && "opacity-55")} id="view-overview" role="tabpanel" aria-labelledby="tab-overview">
      <section className={card}>
        <CardHead title="종합 대시보드">
          <Periods<StatPeriod> id="overview-periods" labels={STAT_PERIODS} value={period} onChange={(p) => { if (p !== period) setStats({ period: p }); }} />
          <span className={cardCount}>{q.isFetching ? "세는 중…" : q.error?.message ?? ""}</span>
        </CardHead>
        {d && <Tiles d={d} span={span} level={level} onPick={(l) => setLevel(l === level ? null : l)} />}
      </section>
      {d && (
        <>
          <div className="grid grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,4fr)] gap-3.5 narrow:grid-cols-[minmax(0,1fr)]">
            <AreaDonut d={d} />
            <Trend d={d} />
            <Summary b={d.briefing} go={go} />
          </div>
          <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-3.5 narrow:grid-cols-[minmax(0,1fr)]">
            <Issues key={level ?? "all"} id="overview-top" title={title} rows={rows} empty={emptyText(level)} go={go} />
            <Recent d={d} span={span} go={go} />
          </div>
        </>
      )}
    </div>
  );
}

// 판정 실패는 따로 표를 두지 않고 타일로 골라 같은 표에서 봄
function picked(d: Overview, level: Pick | null): { rows: OverviewRow[]; total: number; name: string } {
  if (level === "판정 실패") return { rows: d.failed, total: d.counts.failed, name: "판정 실패" };
  if (level) return { rows: d.top.filter((r) => r.level === level), total: d.counts[level], name: `${level} 이슈` };
  return { rows: d.top, total: d.counts["위험"] + d.counts["주의"], name: "전체 이슈" };
}

const emptyText = (level: Pick | null): string => (!level ? "이슈 없음" : level === "판정 실패" ? "판정 실패 없음" : `${level} 이슈 없음`);

// 전체 이슈 = 지금 열린 위험 + 주의 — 아래 표와 같은 건수, 누르면 거르기를 풂. 기간은 완료율에만
// 판정 실패는 0이면 비활성으로 늘 둠 — 실패 때만 나타나면 타일 줄이 갑자기 바뀜
function Tiles({ d, span, level, onPick }: { d: Overview; span: string; level: Pick | null; onPick: (l: Pick | null) => void }) {
  const c = d.counts;
  return (
    <div className={tileGrid} id="overview-tiles">
      <Tile label="전체 이슈" big={c.completion.waiting} pressed={level === null} onClick={() => onPick(null)}>결정 없음 {c.action.undecided}, 조치 중 {c.action.acting}</Tile>
      {(["위험", "주의"] as const).map((l) => (
        <Tile key={l} label={<><LevelDot level={l} />{l}</>} big={c[l]} tone={c[l] ? levelText[l] : undefined} pressed={level === l} onClick={() => onPick(l)}>{deltaText(delta(d.trend, l))}</Tile>
      ))}
      <Tile label={`조치 완료율 (${span})`} big={rateText(c.completion.rate)}>완료 {c.completion.done}, 미완료 {c.completion.waiting}</Tile>
      <Tile label="판정 실패" big={c.failed} pressed={!!c.failed && level === "판정 실패"} disabled={!c.failed}
        onClick={() => onPick("판정 실패")}>{c.failed ? "위험, 주의 집계 제외" : "실패 없음"}</Tile>
    </div>
  );
}

// 요약 셋 = 영역마다 맨 앞 할 일(위험부터), 우선 조치 권고 = AI 한 줄 요약
function Summary({ b, go }: { b: Briefing | null; go: Go }) {
  const jobs = useJobs();
  const start = useStartJob();
  const busy = start.isPending || jobs?.running === "briefing";
  return (
    <section className={card} id="overview-briefing">
      <CardHead title="AI 종합 분석 요약" icon="bot" iconClass="text-brand">
        {b && <span className="text-[12px] text-ink-dim tabular-nums">{stamp(b.created_at)}</span>}
        <button className={cn(toolButton, "p-1.5")} id="briefing-run" disabled={busy} aria-label="다시 정리" data-tip="다시 정리"
          onClick={() => start.mutate("briefing")}>
          <Icon name="refresh" small className={busy ? "animate-spin" : undefined} />
        </button>
      </CardHead>
      {!b ? <p className={SUB}>작업 처리 중, 잠시 기다려 주세요</p> : b.failed ? <p className={cn(SUB, "text-risk")}>정리 실패: {b.error}</p> : (
        <div className="flex flex-col gap-2.5 px-4.5 pb-4">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {firstTodos(b).map((t) => (
              <li key={`${t.area}:${t.item}`}>
                <button onClick={() => go(t.area, t.key)} data-tip={`${t.label}, ${t.subject}|${t.why}`}
                  className="flex w-full items-baseline rounded-md border-none bg-transparent px-1.5 py-1 text-left text-[13px] leading-normal hover:bg-row-hover">
                  <LevelDot level={t.level} /><span className="line-clamp-2">{t.task}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="m-0 flex items-start gap-1.5 rounded-lg border border-brand-soft-line bg-brand-soft px-3 py-2 text-[13px] font-semibold text-brand">
            <Icon name="bulb" small className="mt-0.75" />
            <span><span className="mr-1.5 text-[12px] font-bold">우선 조치 권고</span>{b.headline}</span>
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
      <CardHead title="위험 유형별 현황" />
      <div className="flex flex-wrap items-center gap-5 px-4.5 pb-4">
        <svg viewBox="0 0 140 140" className="size-35 flex-none" role="img" aria-label={`영역별 위험, 주의 이슈 ${total}건`}>
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
          <text x="70" y="88" textAnchor="middle" className="fill-ink-dim text-[11px]">전체 이슈</text>
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
// 이 날 수까지는 날마다 점을 찍고, 넘으면 점이 겹쳐 마지막 날과 가리킨 날에만 찍음
const DOT_DAYS = 14;

// 그날 끝에 남은 위험 주의 — 선 둘, 가리킨 날은 세로선과 값
function Trend({ d }: { d: Overview }) {
  const days = d.trend;
  const max = niceMax(Math.max(1, ...days.flatMap((x) => [x["위험"], x["주의"]])));
  const at = (n: number) => slotAt(n, days.length);
  const line = (k: Open) => days.map((x, n) => `${at(n) * 10},${100 - (x[k] / max) * 100}`).join(" ");
  const last = days[days.length - 1];
  return (
    <section className={card} id="overview-trend">
      <CardHead title="위험, 주의 추이">
        <Legend round className="ml-auto p-0" items={[["위험", "위험"], ["주의", "주의"]]} />
      </CardHead>
      {!last ? <p className={SUB}>기록 없음</p> : (
        <>
          <div className="px-4.5 pt-1 pb-1.5">
            <div className="relative ml-7.5 h-32 border-b border-line" role="img" aria-label={`일별 위험, 주의 (그날 끝에 남은 건), ${last.day} 위험 ${last["위험"]}, 주의 ${last["주의"]}`}>
              <YGrid lines={[max, Math.round(max / 2)].map((v): [number, number] => [v, v / max])} />
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
            <XTicks count={days.length} label={(n) => days[n].day} />
          </div>
        </>
      )}
    </section>
  );
}

// 표는 한 쪽 5줄 — 10줄을 다 펼치면 화면이 길어져 쪽으로 넘김
const PAGE = 5;

function Issues({ id, title, rows, empty, go }: { id: string; title: string; rows: OverviewRow[]; empty: string; go: Go }) {
  const { shown, at, pages, setPage } = usePage(rows, PAGE);
  return (
    <section className={card} id={id}>
      <CardHead title={title} />
      <DataTable head={["발생일", "유형", "대상, 내용", "AI 판단", "처리 상태"]} empty={empty}
        rows={shown.map((r) => ({
          key: `${r.area}:${r.key}`, onSelect: () => go(r.area, r.key),
          cells: [
            <Day key="o" iso={r.opened_at} />,
            <Area key="a" area={r.area} label={r.area_label} />,
            <TwoLine key="c" title={r.subject} note={r.reason} />,
            r.level ? <LevelLabel key="l" level={r.level} /> : <span key="l" className="text-ink-dim">판정 실패</span>,
            <DecisionCell key="d" decision={r.decision} />,
          ],
        }))} />
      {pages > 1 && <Pager className="py-3" at={at} pages={pages} onPage={setPage} />}
    </section>
  );
}


// 최근 조치 — 완료율의 "완료"(조치 완료 결정 · 회수), 늦은 것부터 10건. recent 없는 예전 서버 대비
function Recent({ d, span, go }: { d: Overview; span: string; go: Go }) {
  const rows = d.recent ?? [];
  const { shown, at, pages, setPage } = usePage(rows, PAGE);
  return (
    <section className={card} id="overview-recent">
      <CardHead title={<>최근 조치 내역 ({span}, {ofText(d.counts.completion.done, rows.length)})</>} />
      <DataTable head={["처리일", "유형", "대상, 조치 내용", "결과"]} empty="기간 내 조치 없음"
        rows={shown.map((r) => ({
          key: `${r.area}:${r.key}:${r.at}`, onSelect: () => go(r.area, r.key),
          cells: [
            <Day key="t" iso={r.at} />,
            <Area key="a" area={r.area} label={r.area_label} />,
            <TwoLine key="c" title={r.subject} note={r.note} />,
            <StateCell key="l" text={r.label} tone={DONE_TONE} />,
          ],
        }))} />
      {pages > 1 && <Pager className="py-3" at={at} pages={pages} onPage={setPage} />}
    </section>
  );
}

// 조치 완료 · 회수 모두 끝난 일이라 검토 현황의 "조치 완료" 배지 색을 씀
const DONE_TONE = decisionState({ action: "done" }).tone;

// 날짜만 한 줄 (올해면 연도 뺌), 시각은 툴팁
function Day({ iso }: { iso: string }) {
  return <span className="whitespace-nowrap tabular-nums" data-tip={stamp(iso)}>{dayTime(iso)[0]}</span>;
}

// 유형 — 상자 없이 메뉴 기호와 회색 글
function Area({ area, label }: { area: OverviewRow["area"]; label: string }) {
  return <span className="flex items-center gap-1 whitespace-nowrap text-ink-soft"><Icon name={AREA_ICON[area]} small />{label}</span>;
}
