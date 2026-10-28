import { useMe } from "@/app/me";
import { useJobs } from "@/app/data";
import { TYPE_LABEL, VIEWS } from "@/app/views";
import { useUi } from "@/app/ui/UiContext";
import { useQueue } from "./useQueue";
import { inView, visible } from "./select";
import { emptyText } from "./emptyText";
import type { QueueItem } from "./types";
import { DECISIONS } from "@/features/review/constants";
import { LEVEL_ICON } from "@/shared/lib/levels";
import { Icon } from "@/shared/ui/Icon";

// 검토 현황 목록 — 행과 머리줄은 늘 자식 6개입니다 (좁은 화면이 3 · 4 · 6번째 칸을 위치로 숨깁니다).
export function QueueTable() {
  const me = useMe();
  const { ui, select } = useUi();
  const items = useQueue();
  const jobs = useJobs();
  const view = ui.view;
  const cols = view ? VIEWS[view].cols : [];
  const rows = view ? visible(items, { view, stageFilter: ui.stageFilter, role: me.role, filter: ui.filter, query: ui.query }) : [];
  const anyInView = !!view && items.some((it) => inView(it, view, ui.stageFilter, me.role));
  return (
    <div className="table">
      <div className="tr thead" id="thead">{cols.map((c) => <span key={c}>{c}</span>)}<span /></div>
      <div id="rows">
        {rows.length
          ? rows.map((it) => <Row key={it.key} it={it} current={it.key === ui.selected} onSelect={() => select(it.key)} />)
          : view && <div className="empty">{emptyText(view, ui.stageFilter, jobs, anyInView)}</div>}
      </div>
    </div>
  );
}

function Row({ it, current, onSelect }: { it: QueueItem; current: boolean; onSelect: () => void }) {
  const d = it.decision;
  const sub = d ? `${d.decider_name} · ${DECISIONS[d.action]}` : it.sub;
  return (
    <button className="tr row" aria-current={current} onClick={onSelect}>
      <span className="cell-type">{it.typeLabel || TYPE_LABEL[it.type]}<small>{it.id}</small></span>
      <span className="who">{it.who}</span>
      <span className="detail-cell" data-tip={it.what}>{it.what}</span>
      <span className="time">{it.when}</span>
      <span className="judge">
        {it.level
          ? <span className={`line lv-${it.level}`}><Icon name={LEVEL_ICON[it.level]} className="sm" />{it.level}</span>
          : <span className="line">{it.judge}</span>}
        {sub && <span className="op">{sub}</span>}
      </span>
      <span className="chev"><Icon name="chev" className="sm" /></span>
    </button>
  );
}
