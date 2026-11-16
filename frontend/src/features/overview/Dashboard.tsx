import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaDonut, Issues, Trend } from "./OverviewTab";
import { useGo, type Go } from "./useGo";
import { AREA_COLOR, PERIODS, delta, deltaText, firstTodos, rateText } from "./lib";
import { useQueue } from "@/app/queue/useQueue";
import type { QueueItem } from "@/app/queue/types";
import { useMe } from "@/app/session/me";
import { useUi } from "@/app/ui/state/UiContext";
import { overviewQuery } from "@/shared/api/queries";
import type { Briefing, Overview, StatPeriod } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { stamp } from "@/shared/lib/format";
import { STEP } from "@/shared/lib/request";
import { LevelDot, LevelLabel, Periods, Pill, Tile } from "@/shared/ui/base/parts";
import { DataTable } from "@/shared/ui/charts/parts";
import { brandCard, card, cardCount, cardHead, cardTitle, levelText } from "@/shared/ui/base/styles";

type Open = "위험" | "주의";
const SUB = "m-0 px-4.5 pb-3 text-[12.5px] text-ink-dim";
const PENDING_ROWS = 8;

// 보안 총책임자의 첫 화면 — 내가 결재할 것과 지금 열린 위험을 한눈에 보고, 숫자를 눌러 건별로 들어갑니다.
export function Dashboard() {
  const { ui, setStats, navigate, gotoRequest } = useUi();
  const role = useMe().role;
  const period = ui.stats.period;
  const q = useQuery(overviewQuery(period));
  const d = q.data;
  const go = useGo();
  const pending = useQueue().filter((it) => it.type === "req" && it.raw.stage === STEP[role]);
  const [level, setLevel] = useState<Open | null>(null);
  const openPending = () => (pending.length ? gotoRequest(pending[0].id, "pending") : navigate("requests"));
  const range = q.isFetching ? "세는 중…" : q.isError ? q.error.message : d ? (d.since ? `완료율 ${stamp(d.since)} 부터` : "완료율 처음부터") : "";
  const rows = d ? (level ? d.top.filter((r) => r.level === level) : d.top) : [];
  const total = d && level ? d.counts[level] : 0;
  const title = level ? `열린 ${level} ${total}건${total > rows.length ? ` 중 ${rows.length}건` : ""}` : "주요 위험 이슈";
  return (
    <div className="flex flex-col gap-3.5" id="view-home" style={{ opacity: q.isFetching && d ? 0.55 : undefined }}>
      <section className={card}>
        <div className={cardHead}>
          <h3 className={cardTitle}>현황</h3>
          <Periods<StatPeriod> id="home-periods" labels={PERIODS} value={period} onChange={(p) => { if (p !== period) setStats({ period: p }); }} />
          <span className={cardCount}>{range}</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 px-4.5 pb-4" id="home-tiles">
          <Tile label="최종 결재 대기" big={pending.length} onClick={openPending}>AI 위험 {pending.filter((it) => it.level === "위험").length}</Tile>
          {d && <OpenTiles d={d} level={level} onPick={(l) => setLevel(l === level ? null : l)} />}
        </div>
      </section>
      {d && (
        <>
          <div className="grid grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,4fr)] gap-3.5 narrow:grid-cols-[minmax(0,1fr)]">
            <AreaDonut d={d} />
            <Trend d={d} />
            <Summary b={d.briefing} go={go} />
          </div>
          <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-3.5 narrow:grid-cols-[minmax(0,1fr)]">
            <Issues id="home-top" title={title} rows={rows} empty={level ? `열린 ${level} 없음` : "열린 위험 없음"} go={go} />
            <Pending items={pending} onOpen={(no) => gotoRequest(no, "pending")} />
          </div>
        </>
      )}
    </div>
  );
}

function OpenTiles({ d, level, onPick }: { d: Overview; level: Open | null; onPick: (l: Open) => void }) {
  const c = d.counts;
  return (
    <>
      {(["위험", "주의"] as const).map((l) => (
        <Tile key={l} label={l} big={c[l]} tone={c[l] ? levelText[l] : undefined} pressed={level === l} onClick={() => onPick(l)}>{deltaText(delta(d.trend, l))}</Tile>
      ))}
      <Tile label="조치 필요" big={c.action.total}>결정 없음 {c.action.undecided}, 조치 중 {c.action.acting}</Tile>
      <Tile label="조치 완료율" big={rateText(c.completion.rate)}>완료 {c.completion.done}, 남음 {c.completion.waiting}</Tile>
    </>
  );
}

// 운영자의 종합 탭은 영역마다 할 일을 다 보이고, 여기는 한 줄 요약과 먼저 볼 것만 보입니다.
function Summary({ b, go }: { b: Briefing | null; go: Go }) {
  return (
    <section className={cn(card, brandCard)} id="home-summary">
      <div className={cardHead}>
        <h3 className={cardTitle}>AI 종합 요약</h3>
        {b && !b.current && <Pill tone="border-warn-line bg-warn-tint text-warn-ink" className="text-[11.5px]">그 뒤 바뀜</Pill>}
        <span className={cardCount}>{b ? stamp(b.created_at) : ""}</span>
      </div>
      {!b ? <p className={SUB}>아직 정리 전</p> : b.failed ? <p className={cn(SUB, "text-risk")}>정리 실패: {b.error}</p> : (
        <>
          <p className="m-0 px-4.5 pb-3 text-[15px] font-bold">{b.headline}</p>
          <div className="flex flex-col gap-2 px-4.5 pb-4">
            {firstTodos(b).map((t) => (
              <button key={`${t.area}:${t.item}`} onClick={() => go(t.area, t.key)}
                className="flex min-w-0 flex-col gap-0.5 rounded-lg border-none bg-surface px-2.75 py-2 text-left hover:bg-row-hover">
                <span className="text-[13px] font-semibold"><LevelDot level={t.level} />{t.task}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-dim">
                  <i className="inline-block size-2 flex-none rounded-xs" style={{ background: AREA_COLOR[t.area] }} />
                  <span className="truncate">{t.label}, {t.subject}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Pending({ items, onOpen }: { items: QueueItem[]; onOpen: (no: string) => void }) {
  return (
    <section className={card} id="home-pending">
      <div className={cardHead}>
        <h3 className={cardTitle}>최종 결재 대기</h3>
        <span className={cardCount}>{items.length > PENDING_ROWS ? `${items.length}건 중 ${PENDING_ROWS}건` : `${items.length}건`}</span>
      </div>
      <DataTable head={["신청자", "신청 권한", "AI 판단", "신청 시각"]} empty="결재 대기 없음"
        rows={items.slice(0, PENDING_ROWS).map((it) => ({
          key: it.key, onSelect: () => onOpen(it.id),
          cells: [
            <b key="w" className="whitespace-nowrap">{it.who}</b>,
            it.what,
            it.level ? <LevelLabel key="l" level={it.level} /> : <span key="l" className="text-ink-dim">{it.judge}</span>,
            <span key="t" className="whitespace-nowrap text-ink-dim tabular-nums">{it.when}</span>,
          ],
        }))} />
    </section>
  );
}
