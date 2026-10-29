import type { ReactNode } from "react";
import { PERIOD_LABEL } from "./lib";
import { useLogsPage } from "./useLogsPage";
import { useUi } from "@/app/ui/state/UiContext";
import { PanelHead } from "@/app/ui/panel/Panel";
import { stamp } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/base/Icon";
import { KvTable, Section } from "@/shared/ui/base/parts";

// 패널: 고른 줄이 있으면 그 로그의 원본, 없으면 지금 조건의 집계. 숫자는 모두 서버가 센 값입니다.
export function LogsPanel() {
  const { ui, closePanel } = useUi();
  const L = ui.logs;
  const logs = useLogsPage();
  const d = logs.data;
  const e = d && L.selected !== null ? d.events[L.selected] : null;

  if (e) {
    const fields = ([["시각", stamp(e.occurred_at)], ["사용자", e.user], ["사용자 ID", e.user_id], ["솔루션", e.solution],
      ["위치", e.where], ["행위", e.how], ["IP", e.source_ip], ...Object.entries(e.attributes || {})] as [string, ReactNode][])
      .filter(([, v]) => v);
    return (
      <>
        <PanelHead title="로그 원본" />
        <div className="panel-body">
          <p className="subject">{e.user}</p>
          <div className="meta">{stamp(e.occurred_at)} · {e.solution}</div>
          <Section icon="list" title="내용"><KvTable rows={fields} /></Section>
          <Section icon="file" title="내보낸 행 그대로"><KvTable rows={Object.entries(e.raw || {})} /></Section>
          <button className="rerun" id="log-back" onClick={closePanel}><Icon name="activity" className="sm" />집계로 돌아가기</button>
        </div>
      </>
    );
  }

  const f = d?.facts;
  const list = (obj: Record<string, number> | undefined, limit: number) => {
    const rows = Object.entries(obj || {});
    if (!rows.length) return <p className="note">없음</p>;
    return (
      <>
        <KvTable rows={rows.slice(0, limit).map(([k, v]) => [k, `${v}건`])} />
        {rows.length > limit && <p className="note">상위 {limit}개만 표시합니다.</p>}
      </>
    );
  };
  return (
    <>
      <PanelHead title="조회 집계" />
      <div className="panel-body">
        {!d || !f ? <div className="empty">{logs.isError ? logs.error.message : "불러오는 중…"}</div> : (
          <>
            <p className="subject">{[PERIOD_LABEL[d.period], ...Object.values(d.criteria)].join(" · ")}</p>
            <div className="meta">{stamp(d.since) || "처음"} ~ {stamp(d.until)}</div>
            <Section icon="activity" title="합계">
              <KvTable rows={[
                ["해당 로그", `${f.count.toLocaleString()}건`],
                ...(f.count ? [["처음 · 마지막", `${stamp(f.first)} ~ ${stamp(f.last)}`] as [string, string]] : []),
                ...Object.entries(f.attribute_totals).map(([k, v]) => [`${k} 합계`, String(v)] as [string, string]),
              ]} />
            </Section>
            <Section icon="users" title="사용자별">{list(f.by_user, 20)}</Section>
            <Section icon="list" title="날짜별 (많은 순)">{list(f.by_day, 14)}</Section>
            <p className="note">줄을 고르면 원본을 봅니다.</p>
          </>
        )}
      </div>
    </>
  );
}
