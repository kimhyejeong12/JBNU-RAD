import { useRef } from "react";
import { LOG_FILTERS, PERIOD_LABEL, logAttrs, pageCount } from "./lib";
import { useLogsPage } from "./useLogsPage";
import { useUi } from "@/app/ui/state/UiContext";
import type { UiState } from "@/app/ui/state/uiReducer";
import type { LogPeriod, LogsPage } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { activateProps } from "@/shared/lib/hooks";
import { Periods } from "@/shared/ui/base/parts";

const PERIODS = Object.entries(PERIOD_LABEL) as [LogPeriod, string][];
type LogCond = UiState["logs"];

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
    <section className="card logs" id="view-logs" role="tabpanel" aria-labelledby="tab-logs" ref={section}>
      <div className="logs-head">
        <h3>로그 조회</h3>
        <Periods id="log-periods" labels={PERIODS} value={L.period} onChange={(period) => { if (period !== L.period) change({ period }); }} />
        <span className="logs-count" id="log-count">{logs.isFetching ? "불러오는 중…" : d ? `${d.total.toLocaleString()}건` : ""}</span>
      </div>
      <LogFilters options={d?.options} cond={L} onChange={change} />
      <div className="ltable-wrap">
        <table className="ltable">
          <thead><tr><th>시각</th><th>사용자</th><th className="col-sol">솔루션</th><th className="col-where">위치</th><th className="col-how">행위</th><th>항목</th></tr></thead>
          <tbody id="log-rows">
            {logs.isError ? <tr><td colSpan={6} className="empty">로그를 불러오지 못했습니다: {logs.error.message}</td></tr>
              : !d ? <tr><td colSpan={6} className="empty">불러오는 중…</td></tr>
                : !d.events.length ? <tr><td colSpan={6} className="empty">{PERIOD_LABEL[d.period]} 안에 조건에 맞는 로그가 없습니다.</td></tr>
                  : d.events.map((e, n) => (
                    <tr key={n} data-n={n} aria-current={n === L.selected} {...activateProps(() => pick(n))}>
                      <td className="when">{stamp(e.occurred_at)}</td><td className="lwho">{e.user}</td><td className="col-sol">{e.solution}</td>
                      <td className="col-where">{e.where}</td><td className="col-how">{e.how}</td><td className="attrs">{logAttrs(e)}</td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
      <div className="pager" id="log-pager">
        {d && pages > 1 && (
          <>
            <button className="rerun" disabled={L.page <= 1} onClick={() => goPage(L.page - 1)}>이전</button>
            <span>{L.page} / {pages}쪽</span>
            <button className="rerun" disabled={L.page >= pages} onClick={() => goPage(L.page + 1)}>다음</button>
          </>
        )}
      </div>
    </section>
  );
}

// 거르기 칸 — 값은 응답의 options 에서. 고른 값이 로그에 없더라도(판정에서 넘어온 사용자 등) 칸에서 사라지지 않게 둡니다.
function LogFilters({ options, cond, onChange }: { options?: LogsPage["options"]; cond: LogCond; onChange: (patch: Partial<LogCond>) => void }) {
  return (
    <div className="logs-filters">
      {LOG_FILTERS.map(([k, id, all, opt]) => {
        const values = [...(options?.[opt] ?? [])];
        if (cond[k] && !values.includes(cond[k])) values.unshift(cond[k]);
        return (
          <select key={k} id={id} className="select" aria-label={all.replace("전체 ", "")} value={cond[k]} onChange={(e) => onChange({ [k]: e.target.value })}>
            <option value="">{all}</option>
            {values.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        );
      })}
    </div>
  );
}
