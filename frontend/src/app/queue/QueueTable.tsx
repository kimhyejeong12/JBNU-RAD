import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { TYPE_LABEL, VIEWS, isAdminView } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "./useQueue";
import { inView, visible, emptyText } from "./select";
import type { QueueItem } from "./types";
import { DECISIONS } from "@/features/review/lib";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { empty, levelText } from "@/shared/ui/base/styles";

// 검토 현황 목록 — 행과 머리줄은 같은 6칸 그리드입니다. 좁은 화면에서는 3 · 4 · 6번째 칸(상세 · 시각 · 화살표)을 숨깁니다.
const GRID = "grid grid-cols-[84px_minmax(200px,1.4fr)_minmax(160px,1.3fr)_92px_112px_16px] items-center gap-3 px-4.5 narrow:grid-cols-[70px_minmax(0,1fr)_100px]";
const NARROW_HIDE = new Set([2, 3, 5]);
export function QueueTable() {
  const me = useMe();
  const { ui, select, dispatch } = useUi();
  const items = useQueue();
  const jobs = useJobs();
  const view = ui.view;
  const cols = view ? VIEWS[view].cols : [];
  const rows = view ? visible(items, { view, stageFilter: ui.stageFilter, role: me.role, filter: ui.filter, query: ui.query }) : [];
  const anyInView = !!view && items.some((it) => inView(it, view, ui.stageFilter, me.role));
  // 고른 줄을 다시 누르면 선택을 풉니다 (패널은 안내만). 관리 메뉴는 선택 없음이 곧 등록 창이라 풀지 않습니다.
  const onRow = (key: string) => (key === ui.selected && view && !isAdminView(view) ? dispatch({ type: "DESELECT" }) : select(key));
  return (
    <div className="border-t border-line">
      <div id="thead" className={cn(GRID, "h-9.5 border-b border-line text-[12px] font-semibold text-ink-dim")}>
        {[...cols, ""].map((c, i) => <span key={c || i} className={cn(NARROW_HIDE.has(i) && "narrow:hidden")}>{c}</span>)}
      </div>
      <div id="rows">
        {rows.length
          ? rows.map((it) => <Row key={it.key} it={it} current={it.key === ui.selected} onSelect={() => onRow(it.key)} />)
          : view && <div className={empty}>{emptyText(view, ui.stageFilter, jobs, anyInView)}</div>}
      </div>
    </div>
  );
}

// 줄 — 누르면 오른쪽 패널에 내용을 엽니다 (일반 사용자의 내 신청은 features/requests/MineList).
const ROW = "min-h-14 w-full border-0 border-b border-l-[3px] border-b-line border-l-transparent bg-surface py-2 pr-4.5 pl-3.75 text-left";
function Row({ it, current, onSelect }: { it: QueueItem; current: boolean; onSelect: () => void }) {
  const d = it.decision;
  const sub = d ? `${d.decider_name} · ${DECISIONS[d.action]}` : it.sub;
  const cells = (
    <>
      <span className="text-[12.5px] text-ink-dim">{it.typeLabel || TYPE_LABEL[it.type]}<small className="block text-[11px] text-ink-faint tabular-nums">{it.id}</small></span>
      <span className="line-clamp-2 min-w-0 font-semibold leading-[1.35]">{it.who}</span>
      <span className="cursor-pointer truncate text-ink-soft narrow:hidden" data-tip={it.what}>{it.what}</span>
      <span className="text-[12.5px] text-ink-dim tabular-nums narrow:hidden">{it.when}</span>
      <span className="flex flex-col gap-px text-[13px] font-semibold">
        {it.level
          ? <span className={cn("flex items-center gap-1.25", levelText[it.level])}><Icon name={LEVEL_ICON[it.level]} small />{it.level}</span>
          : <span className="flex items-center gap-1.25">{it.judge}</span>}
        {sub && <span className="text-[11px] font-medium text-ink-dim">{sub}</span>}
      </span>
      <span className="text-ink-ghost narrow:hidden"><Icon name="chev" small /></span>
    </>
  );
  return (
    // 고른 행은 hover 보다 고른 색이 이깁니다. 왼쪽 3px 띠는 고른 행에서만 빨간색.
    <button aria-current={current} onClick={onSelect}
      className={cn(GRID, ROW, current ? "border-l-risk bg-risk-tint" : "hover:bg-row-hover")}>
      {cells}
    </button>
  );
}
