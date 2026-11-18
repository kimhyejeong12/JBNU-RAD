import { useRef, type ReactNode } from "react";
import { LOG_FILTERS, PERIOD_LABEL, filterChoices, logAttrs, pageCount, useLogsPage } from "./lib";
import { useUi } from "@/app/ui/state/UiContext";
import type { UiState } from "@/app/ui/state/uiReducer";
import type { LogPeriod, LogsPage } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { activateProps } from "@/shared/lib/hooks";
import { Periods, CardHead, SearchBox } from "@/shared/ui/parts";
import { cn } from "@/shared/lib/cn";
import { card, lrowTone, ltable, ltableWrap, ltd, ltdEmpty, lth, toolButton, cardCountInline } from "@/shared/ui/styles";

const PERIODS = Object.entries(PERIOD_LABEL) as [LogPeriod, string][];
type LogCond = UiState["logs"];
// 창 폭이 아니라 표 폭(560px)으로 솔루션 · 위치 · 행위 칸을 숨김
const WIDE_TH = cn(lth, "@max-[560px]:hidden");
const WIDE_TD = cn(ltd, "whitespace-nowrap @max-[560px]:hidden");

export function LogsTab() {
  const { ui, setLogs, openDrawer } = useUi();
  const L = ui.logs;
  const section = useRef<HTMLElement>(null);
  const logs = useLogsPage();
  const d = logs.data;
  const pages = d ? pageCount(d) : 1;

  const change = (patch: Partial<LogCond>) => setLogs({ ...patch, page: patch.page ?? 1, selected: null });
  const goPage = (page: number) => {
    change({ page });
    section.current?.scrollIntoView({ block: "start" });
  };
  const pick = (n: number) => {
    if (n === L.selected) return setLogs({ selected: null });
    setLogs({ selected: n });
    openDrawer();
  };

  return (
    <section className={cn(card, "@container flex min-h-80 flex-col")} id="view-logs" role="tabpanel" aria-labelledby="tab-logs" ref={section}>
      <CardHead title="로그 조회">
        <span className={cardCountInline} id="log-count">{logs.isFetching ? "불러오는 중…" : d ? `${d.total.toLocaleString()}건` : ""}</span>
      </CardHead>
      <LogFilters d={d} cond={L} onChange={change} />
      <div className={ltableWrap}>
        <table className={ltable}>
          <thead><tr><th className={lth}>시각</th><th className={lth}>사용자</th><th className={WIDE_TH}>솔루션</th><th className={WIDE_TH}>위치</th><th className={WIDE_TH}>행위</th><th className={lth}>항목</th></tr></thead>
          <tbody id="log-rows">
            {logs.isError ? <tr className={lrowTone(false)}><td colSpan={6} className={ltdEmpty}>로그를 불러오지 못했습니다: {logs.error.message}</td></tr>
              : !d ? <tr className={lrowTone(false)}><td colSpan={6} className={ltdEmpty}>불러오는 중…</td></tr>
                : !d.events.length ? <tr className={lrowTone(false)}><td colSpan={6} className={ltdEmpty}>{PERIOD_LABEL[d.period]} 안에 조건에 맞는 로그가 없습니다.</td></tr>
                  : d.events.map((e, n) => (
                    <tr key={n} data-n={n} aria-current={n === L.selected} className={lrowTone(n === L.selected)} {...activateProps(() => pick(n))}>
                      <td className={cn(ltd, "whitespace-nowrap tabular-nums")}>{stamp(e.occurred_at)}</td><td className={cn(ltd, "whitespace-nowrap")}>{e.user}</td><td className={WIDE_TD}>{e.solution}</td>
                      <td className={WIDE_TD}>{e.where}</td><td className={WIDE_TD}>{e.how}</td><td className={cn(ltd, "text-ink-dim wrap-anywhere")}>{logAttrs(e)}</td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-center gap-3 p-3 text-[12.5px] text-ink-dim" id="log-pager">
        {d && pages > 1 && (
          <>
            <button className={toolButton} disabled={L.page <= 1} onClick={() => goPage(L.page - 1)}>이전</button>
            <span>{L.page} / {pages}쪽</span>
            <button className={toolButton} disabled={L.page >= pages} onClick={() => goPage(L.page + 1)}>다음</button>
          </>
        )}
      </div>
    </section>
  );
}

// 표를 거르는 조건(기간 · 솔루션 · 행위 · 사용자)을 한 상자에 묶음 — 값이 하나뿐이거나 없어도 무엇으로 거를 수 있는지 보이게 늘 둠
// 사용자 칸은 남은 폭이 160px 이상이면 같은 줄에 두고 검색 칸이 줄어듦
function LogFilters({ d, cond, onChange }: { d?: LogsPage; cond: LogCond; onChange: (patch: Partial<LogCond>) => void }) {
  return (
    <div className="mx-4.5 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line px-3.5 py-2.5">
      <Labeled label="기간">
        <Periods id="log-periods" label="기간" labels={PERIODS} value={cond.period} onChange={(period) => { if (period !== cond.period) onChange({ period }); }} />
      </Labeled>
      {LOG_FILTERS.map(([k, id, label, opt, fact]) => {
        const choices = filterChoices(d?.options[opt] ?? [], cond[k], d?.facts?.[fact]);
        return (
          <Labeled key={k} label={label}>
            <Periods id={id} label={label} value={cond[k]} onChange={(v) => { if (v !== cond[k]) onChange({ [k]: v }); }}
              labels={[["", "전체"], ...choices.map((c): [string, ReactNode] => [c.value, <>{c.value}{c.count != null && <span className="ml-1.5 tabular-nums text-ink-faint">{c.count}</span>}</>])]} />
          </Labeled>
        );
      })}
      <Labeled label="사용자" className="min-w-0 flex-[1_1_160px] justify-end phone:basis-full">
        <PickInput key={cond.user} id="log-user" label="사용자" values={filterChoices(d?.options.users ?? [], cond.user, undefined).map((c) => c.value)}
          value={cond.user} onPick={(v) => onChange({ user: v })} />
      </Labeled>
    </div>
  );
}

const Labeled = ({ label, className, children }: { label: string; className?: string; children: ReactNode }) => (
  <div className={cn("flex items-center gap-2", className)}>
    <span className="text-[12px] font-semibold whitespace-nowrap text-ink-dim">{label}</span>
    {children}
  </div>
);

// 서버는 완전 일치로 거르므로 목록의 이름과 같아지거나 비울 때만 거름
function PickInput({ id, label, values, value, onPick }: { id: string; label: string; values: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <SearchBox className="min-w-0 max-w-50 flex-1 phone:max-w-none" id={id} list={`${id}-list`} defaultValue={value} aria-label={label} placeholder="이름 찾기"
      onChange={(e) => { const v = e.target.value.trim(); if (!v || values.includes(v)) onPick(v); }}>
      <datalist id={`${id}-list`}>{values.map((v) => <option key={v} value={v} />)}</datalist>
    </SearchBox>
  );
}
