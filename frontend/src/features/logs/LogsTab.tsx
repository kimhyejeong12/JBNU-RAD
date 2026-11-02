import { useRef, type ReactNode } from "react";
import { LOG_FILTERS, MAX_FILTER_BUTTONS, PERIOD_LABEL, filterChoices, logAttrs, pageCount } from "./lib";
import { useLogsPage } from "./useLogsPage";
import { useUi } from "@/app/ui/state/UiContext";
import type { UiState } from "@/app/ui/state/uiReducer";
import type { LogPeriod, LogsPage } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { activateProps } from "@/shared/lib/hooks";
import { Periods } from "@/shared/ui/base/parts";
import { Icon } from "@/shared/ui/base/Icon";
import { cn } from "@/shared/lib/cn";
import { card, cardCount, cardHead, cardTitle, lrowTone, ltable, ltableWrap, ltd, ltdEmpty, lth, searchBox, searchInput, toolButton } from "@/shared/ui/base/styles";

const PERIODS = Object.entries(PERIOD_LABEL) as [LogPeriod, string][];
type LogCond = UiState["logs"];
// 좁은 화면에서는 솔루션 · 위치 · 행위 칸을 숨깁니다.
const WIDE_TH = cn(lth, "narrow:hidden");
const WIDE_TD = cn(ltd, "narrow:hidden");

// 로그 조회 — 거르기 · 세기는 서버가 합니다. 화면은 조건을 넘기고 받은 그대로 보여줍니다. 조건이 바뀔 때만 다시 받습니다.
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
    setLogs({ selected: n });
    openDrawer();
  };

  return (
    <section className={cn(card, "flex min-h-80 flex-col")} id="view-logs" role="tabpanel" aria-labelledby="tab-logs" ref={section}>
      <div className={cardHead}>
        <h3 className={cardTitle}>로그 조회</h3>
        <Periods id="log-periods" labels={PERIODS} value={L.period} onChange={(period) => { if (period !== L.period) change({ period }); }} />
        <span className={cardCount} id="log-count">{logs.isFetching ? "불러오는 중…" : d ? `${d.total.toLocaleString()}건` : ""}</span>
      </div>
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

// 거르기 — 값을 버튼 줄로 늘어놓고 건수를 붙입니다 (눌러 봐야 보이는 고르기 칸 대신). 값은 응답의 options, 건수는 facts 에서.
// 값이 많으면(사용자 수백 명 등) 버튼 대신 입력하면 후보가 뜨는 칸으로 바꿉니다.
function LogFilters({ d, cond, onChange }: { d?: LogsPage; cond: LogCond; onChange: (patch: Partial<LogCond>) => void }) {
  return (
    <div className="flex flex-col gap-2 px-4.5 pb-3">
      {LOG_FILTERS.map(([k, id, label, opt, fact]) => {
        const choices = filterChoices(d?.options[opt] ?? [], cond[k], d?.facts?.[fact]);
        return (
          <div key={k} className="flex items-center gap-2.5">
            <span className="w-11 shrink-0 text-[12px] font-semibold text-ink-dim">{label}</span>
            {choices.length > MAX_FILTER_BUTTONS
              ? <PickInput key={cond[k]} id={id} label={label} values={choices.map((c) => c.value)} value={cond[k]} onPick={(v) => onChange({ [k]: v })} />
              : <Periods id={id} label={label} value={cond[k]} onChange={(v) => { if (v !== cond[k]) onChange({ [k]: v }); }}
                labels={[["", "전체"], ...choices.map((c): [string, ReactNode] => [c.value, <>{c.value}{c.count != null && <span className="ml-1.5 tabular-nums text-ink-faint">{c.count}</span>}</>])]} />}
          </div>
        );
      })}
    </div>
  );
}

// 값이 많을 때 — 입력하면 후보가 뜨고, 목록에 있는 값과 똑같아지거나 비우면 거릅니다 (서버는 완전 일치로 거름).
function PickInput({ id, label, values, value, onPick }: { id: string; label: string; values: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <label className={cn(searchBox, "w-full max-w-[320px]")}>
      <Icon name="search" small />
      <input id={id} type="search" list={`${id}-list`} className={searchInput} defaultValue={value} placeholder={`${label} 이름으로 찾기`} autoComplete="off"
        onChange={(e) => { const v = e.target.value.trim(); if (!v || values.includes(v)) onPick(v); }} />
      <datalist id={`${id}-list`}>{values.map((v) => <option key={v} value={v} />)}</datalist>
    </label>
  );
}
