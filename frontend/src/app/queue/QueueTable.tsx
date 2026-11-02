import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { TYPE_LABEL, VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "./useQueue";
import { inView, visible, emptyText } from "./select";
import type { QueueItem } from "./types";
import { DECISIONS } from "@/features/review/lib";
import { WithdrawButton } from "@/features/requests/RequestForm";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { empty, levelText, linkButton } from "@/shared/ui/base/styles";

// 검토 현황 목록 — 행과 머리줄은 같은 6칸 그리드입니다. 좁은 화면에서는 3 · 4 · 6번째 칸(상세 · 시각 · 화살표)을 숨깁니다.
const GRID = "grid grid-cols-[84px_minmax(200px,1.4fr)_minmax(160px,1.3fr)_92px_112px_16px] items-center gap-3 px-4.5 narrow:grid-cols-[70px_minmax(0,1fr)_100px]";
// 내 신청은 오른쪽 좁은 칸에 들어가므로 따로 — 신청 번호가 한 줄에 들어가게 넓히고, 권한 · 사유 칸은 남는 폭만큼 줄어 잘립니다 (화살표 칸은 없음).
const MINE_GRID = "grid grid-cols-[132px_minmax(0,1.2fr)_minmax(0,1fr)_88px_76px_0px] items-center gap-3 px-4.5 narrow:grid-cols-[132px_minmax(0,1fr)_80px]";
const NARROW_HIDE = new Set([2, 3, 5]);
export function QueueTable() {
  const me = useMe();
  const { ui, select, toggleChip } = useUi();
  const items = useQueue();
  const jobs = useJobs();
  const view = ui.view;
  const cols = view ? VIEWS[view].cols : [];
  const grid = view === "mine" ? MINE_GRID : GRID;
  const rows = view ? visible(items, { view, stageFilter: ui.stageFilter, role: me.role, filter: ui.filter, query: ui.query }) : [];
  const anyInView = !!view && items.some((it) => inView(it, view, ui.stageFilter, me.role));
  return (
    <div className="border-t border-line">
      <div id="thead" className={cn(grid, "h-9.5 border-b border-line text-[12px] font-semibold text-ink-dim")}>
        {[...cols, ""].map((c, i) => <span key={c || i} className={cn(NARROW_HIDE.has(i) && "narrow:hidden")}>{c}</span>)}
      </div>
      <div id="rows">
        {rows.length
          // 내 신청은 패널이 없어 고르지 않습니다. 반려 사유는 상태 칸의 [사유 보기]로 펼칩니다.
          ? rows.map((it) => (
            <Row key={it.key} grid={grid} it={it} current={it.key === ui.selected} onSelect={it.type !== "mine" ? () => select(it.key) : undefined}
              noteOpen={ui.expanded.has(`note:${it.key}`)} onNote={() => toggleChip(`note:${it.key}`)} />
          ))
          : view && <div className={empty}>{emptyText(view, ui.stageFilter, jobs, anyInView)}</div>}
      </div>
    </div>
  );
}

// 줄 — 누르면 오른쪽 패널에 내용을 엽니다. 일반 사용자의 내 신청은 패널이 없어 누르지 않습니다.
// 반려 사유는 반려 직후 한 번 보면 되는 정보라 접어 두고, 여는 방법은 상태 칸의 [사유 보기] 글자로 보입니다 (늘 펼치면 반려가 쌓일수록 목록이 지저분해짐).
const ROW = "min-h-14 w-full border-0 border-b border-l-[3px] border-b-line border-l-transparent bg-surface py-2 pr-4.5 pl-3.75 text-left";
function Row({ grid, it, current, onSelect, noteOpen, onNote }: { grid: string; it: QueueItem; current: boolean; onSelect?: () => void; noteOpen: boolean; onNote: () => void }) {
  const d = it.decision;
  const sub = d ? `${d.decider_name} · ${DECISIONS[d.action]}` : it.sub;
  const cells = (
    <>
      <span className="text-[12.5px] text-ink-dim">{it.typeLabel || TYPE_LABEL[it.type]}<small className="block text-[11px] text-ink-faint tabular-nums">{it.id}</small></span>
      <span className="line-clamp-2 min-w-0 font-semibold leading-[1.35]">{it.who}</span>
      <span className={cn("truncate text-ink-soft narrow:hidden", onSelect && "cursor-pointer")} data-tip={it.what}>{it.what}</span>
      <span className="text-[12.5px] text-ink-dim tabular-nums narrow:hidden">{it.when}</span>
      <span className="flex flex-col gap-px text-[13px] font-semibold">
        {it.level
          ? <span className={cn("flex items-center gap-1.25", levelText[it.level])}><Icon name={LEVEL_ICON[it.level]} small />{it.level}</span>
          : <span className="flex items-center gap-1.25">{it.judge}</span>}
        {sub && <span className="text-[11px] font-medium text-ink-dim">{sub}</span>}
        {it.type === "mine" && <WithdrawButton r={it.raw} />}
        {it.note && <button type="button" className={linkButton} aria-expanded={noteOpen} onClick={onNote}>{noteOpen ? "사유 접기" : "사유 보기"}</button>}
      </span>
      <span className="text-ink-ghost narrow:hidden">{onSelect && <Icon name="chev" small />}</span>
      {/* 반려 사유 — 신청 권한 칸부터 끝까지 */}
      {it.note && noteOpen && <p className="col-start-2 -col-end-1 m-0 rounded-lg bg-canvas px-3 py-2 text-[12.5px] whitespace-pre-line text-ink-soft wrap-anywhere">{it.note}</p>}
    </>
  );
  if (!onSelect) return <div className={cn(grid, ROW)}>{cells}</div>;
  return (
    // 고른 행은 hover 보다 고른 색이 이깁니다. 왼쪽 3px 띠는 고른 행에서만 빨간색.
    <button aria-current={current} onClick={onSelect}
      className={cn(grid, ROW, current ? "border-l-risk bg-risk-tint" : "hover:bg-row-hover")}>
      {cells}
    </button>
  );
}
