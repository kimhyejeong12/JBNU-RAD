import type { ReactNode } from "react";
import { PERIOD_LABEL, useLogsPage } from "./lib";
import { useUi } from "@/app/ui/state/UiContext";
import { Panel } from "@/app/ui/panel/Panel";
import { stamp, stampRange } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { KvTable, Section, Subject } from "@/shared/ui/parts";
import { empty, note, toolButton } from "@/shared/ui/styles";

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
      <Panel title="로그 원본">
        <Subject title={e.user} info={[stamp(e.occurred_at), e.solution]} />
        <Section icon="list" title="내용"><KvTable rows={fields} /></Section>
        <button className={toolButton} id="log-back" onClick={closePanel}><Icon name="activity" small />집계로 돌아가기</button>
      </Panel>
    );
  }

  const f = d?.facts;
  const list = (obj: Record<string, number> | undefined, limit: number) => {
    const rows = Object.entries(obj || {});
    if (!rows.length) return <p className={note}>없음</p>;
    return (
      <>
        <KvTable rows={rows.slice(0, limit).map(([k, v]) => [k, `${v}건`])} />
        {rows.length > limit && <p className={note}>상위 {limit}개</p>}
      </>
    );
  };
  return (
    <Panel title="조회 집계">
      {!d || !f ? <div className={empty}>{logs.isError ? logs.error.message : "불러오는 중…"}</div> : (
        <>
          <Subject title={[PERIOD_LABEL[d.period], ...Object.values(d.criteria)].join(", ")} info={<>{stamp(d.since) || "처음"} ~ {stamp(d.until)}</>} />
          <Section icon="activity" title="합계">
            <KvTable rows={[
              ["해당 로그", `${f.count.toLocaleString()}건`],
              ...(f.count ? [["기간", stampRange(f.first, f.last)] as [string, string]] : []),
              ...Object.entries(f.attribute_totals).map(([k, v]) => [`${k} 합계`, String(v)] as [string, string]),
            ]} />
          </Section>
          <Section icon="users" title="사용자별">{list(f.by_user, 20)}</Section>
          <Section icon="list" title="날짜별 (많은 순)">{list(f.by_day, 14)}</Section>
          <p className={note}>줄을 고르면 원본이 보입니다.</p>
        </>
      )}
    </Panel>
  );
}
