import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { LEVEL_VIEWS, PEOPLE_COLS, TYPE_LABEL, VIEWS, type ItemType } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "./useQueue";
import { inView, visible, emptyText } from "./select";
import type { QueueItem } from "./types";
import { DECISIONS, decisionState } from "@/app/ui/panel/decision";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { Pill } from "@/shared/ui/base/parts";
import { empty, levelText } from "@/shared/ui/base/styles";

// 창 폭이 아니라 목록 폭(약 560px)으로 상세 · 시각을 숨깁니다 — 메뉴 · 패널을 펼치면 목록이 좁아져서.
const GRID = "grid grid-cols-[minmax(120px,1fr)_minmax(140px,2fr)_120px_104px] items-center gap-3 px-4.5 @max-[560px]:grid-cols-[minmax(0,1fr)_100px]";
// 판정 목록은 AI 판단과 사람의 처리 상태를 다른 열로 둡니다.
const GRID_SPLIT = "grid grid-cols-[minmax(120px,1fr)_minmax(140px,2fr)_120px_76px_128px] items-center gap-3 px-4.5 @max-[560px]:grid-cols-[minmax(0,1fr)_64px_96px]";
const SLIM_HIDE = new Set([1, 2]);
const SLIM = "@max-[560px]:hidden";
export function QueueTable() {
  const me = useMe();
  const { ui, select, dispatch } = useUi();
  const items = useQueue();
  const jobs = useJobs();
  const view = ui.view;
  const people = view === "requests" && ui.stageFilter === "people";
  const cols = people ? PEOPLE_COLS : view ? VIEWS[view].cols : [];
  // 권한 신청 · 정책 관리 · 로그 감시는 AI 판단과 처리 상태를 다른 열로 둡니다.
  const split = !people && !!view && LEVEL_VIEWS.has(view);
  const grid = split ? GRID_SPLIT : GRID;
  const rows = view ? visible(items, { view, stageFilter: ui.stageFilter, role: me.role, filter: ui.filter, query: ui.query }) : [];
  const anyInView = !!view && items.some((it) => inView(it, view, ui.stageFilter, me.role));
  const onRow = (key: string) => (key === ui.selected ? dispatch({ type: "DESELECT" }) : select(key));
  return (
    <div className="@container border-t border-line">
      <div id="thead" className={cn(grid, "h-9.5 border-b border-line text-[12px] font-semibold text-ink-dim")}>
        {cols.map((c, i) => <span key={c} className={cn(SLIM_HIDE.has(i) && SLIM)}>{c}</span>)}
      </div>
      <div id="rows">
        {rows.length
          ? rows.map((it) => <Row key={it.key} it={it} split={split} current={it.key === ui.selected} onSelect={() => onRow(it.key)} />)
          : view && <div className={empty}>{emptyText(view, ui.stageFilter, jobs, anyInView)}</div>}
      </div>
    </div>
  );
}

// 처리 상태 — 신청은 결재 단계, 정책 · 서버 · 로그는 운영자 결정입니다 (1차 판정처럼 결정 전 글이 있으면 그 글).
function stateOf(it: QueueItem): { text: string; tone: string } {
  if (it.type === "req") return { text: it.sub ?? "", tone: "border-line text-ink-soft" };
  if (it.decision || !it.sub) return decisionState(it.decision);
  return { text: it.sub, tone: "border-line text-ink-dim" };
}

const MIXED = new Set<ItemType>(["policy", "server"]);
const ROW = "min-h-14 w-full border-0 border-b border-l-[3px] border-b-line border-l-transparent bg-surface py-2 pr-4.5 pl-3.75 text-left";
function Row({ it, split, current, onSelect }: { it: QueueItem; split: boolean; current: boolean; onSelect: () => void }) {
  const d = it.decision;
  const grid = split ? GRID_SPLIT : GRID;
  const sub = d ? `${DECISIONS[d.action]} (${d.decider_name})` : it.sub;
  const state = stateOf(it);
  const tag = [it.typeLabel ?? (MIXED.has(it.type) ? TYPE_LABEL[it.type] : ""), it.id && !it.who.includes(it.id) ? it.id : ""].filter(Boolean).join(" ");
  const cells = (
    <>
      <span className="min-w-0">
        <span className="line-clamp-2 font-semibold leading-[1.35]">{it.who}</span>
        {tag && <small className="mt-0.5 block truncate text-[11px] text-ink-faint tabular-nums">{tag}</small>}
      </span>
      <span className={cn("cursor-pointer truncate text-ink-soft", SLIM)} data-tip={it.what}>{it.what}</span>
      <span className={cn("text-[12.5px] whitespace-nowrap text-ink-dim tabular-nums", SLIM)}>{it.when}</span>
      <span className="flex flex-col gap-px text-[13px] font-semibold">
        {it.level
          ? <span className={cn("flex items-center gap-1.25", levelText[it.level])}><Icon name={LEVEL_ICON[it.level]} small />{it.level}</span>
          : <span className="flex items-center gap-1.25">{it.judge}</span>}
        {!split && sub && <span className="text-[11px] font-medium text-ink-dim">{sub}</span>}
      </span>
      {split && (
        <span className="flex min-w-0 flex-col items-start gap-px">
          <Pill tone={state.tone} className="block max-w-full truncate">{state.text}</Pill>
          {d && <span className="max-w-full truncate text-[11px] text-ink-dim">{d.decider_name}</span>}
        </span>
      )}
    </>
  );
  return (
    <button aria-current={current} onClick={onSelect}
      className={cn(grid, ROW, current ? "border-l-risk bg-risk-tint" : "hover:bg-row-hover")}>
      {cells}
    </button>
  );
}
