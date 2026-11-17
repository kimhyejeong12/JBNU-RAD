import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { LEVEL_VIEWS, TYPE_LABEL, VIEWS, type ItemType } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "./useQueue";
import { inView, visible, emptyText } from "./select";
import type { QueueItem } from "./types";
import { DECISIONS, decisionState } from "@/app/ui/panel/decision";
import { StateCell } from "@/app/ui/panel/DecisionFoot";
import { cn } from "@/shared/lib/cn";
import { IconBadge, LevelLabel } from "@/shared/ui/parts";
import { empty, levelText, stageTone } from "@/shared/ui/styles";

// 창 폭이 아니라 목록 폭(약 560px)으로 상세 · 시각을 숨깁니다 — 메뉴 · 패널을 펼치면 목록이 좁아져서.
const GRID = "grid grid-cols-[minmax(120px,1fr)_minmax(140px,2fr)_120px_104px] items-center gap-3 px-4.5 @max-[560px]:grid-cols-[minmax(0,1fr)_100px]";
// 판정 목록은 AI 판단과 사람의 처리 상태를 다른 열로 둡니다.
const GRID_SPLIT = "grid grid-cols-[minmax(120px,1fr)_minmax(140px,2fr)_120px_76px_128px] items-center gap-3 px-4.5 @max-[560px]:grid-cols-[minmax(0,1fr)_64px_96px]";
// 줄마다 시각이 같은 목록(정책 관리)은 시간 열이 없습니다.
const GRID_SPLIT_NO_TIME = "grid grid-cols-[minmax(120px,1fr)_minmax(140px,2fr)_76px_128px] items-center gap-3 px-4.5 @max-[560px]:grid-cols-[minmax(0,1fr)_64px_96px]";
// 셋째 칸이 배지(역할 · 업무 시스템)인 관리 목록입니다.
const GRID_BADGE = "grid grid-cols-[minmax(120px,1fr)_minmax(140px,1.6fr)_164px_120px_96px] items-center gap-3 px-4.5 @max-[560px]:grid-cols-[minmax(0,1fr)_100px]";
const SLIM = "@max-[560px]:hidden";
export function QueueTable() {
  const me = useMe();
  const { ui, select, dispatch } = useUi();
  const items = useQueue();
  const jobs = useJobs();
  const view = ui.view;
  const cols = view ? VIEWS[view].cols : [];
  // 권한 신청 · 정책 관리 · 로그 감시는 AI 판단과 처리 상태를 다른 열로 둡니다.
  const split = !!view && LEVEL_VIEWS.has(view);
  const time = !view || VIEWS[view].time !== false;
  const badge = !!view && VIEWS[view].badge === true;
  const grid = badge ? GRID_BADGE : !split ? GRID : time ? GRID_SPLIT : GRID_SPLIT_NO_TIME;
  const slim = badge ? [1, 2, 3] : time ? [1, 2] : [1];
  const rows = view ? visible(items, { view, stageFilter: ui.stageFilter, role: me.role, filter: ui.filter, query: ui.query }) : [];
  const anyInView = !!view && items.some((it) => inView(it, view, ui.stageFilter, me.role));
  const onRow = (key: string) => (key === ui.selected ? dispatch({ type: "DESELECT" }) : select(key));
  return (
    <div className="@container min-h-0 flex-1 overflow-auto">
      <div id="thead" className={cn(grid, "sticky top-0 z-1 h-9.5 border-b border-line bg-surface text-[12px] font-semibold text-ink-dim")}>
        {cols.map((c, i) => <span key={c} className={cn(slim.includes(i) && SLIM)}>{c}</span>)}
      </div>
      <div id="rows">
        {rows.length
          ? rows.map((it) => <Row key={it.key} it={it} split={split} badge={badge} grid={grid} time={time} current={it.key === ui.selected} onSelect={() => onRow(it.key)} />)
          : view && <div className={empty}>{emptyText(view, ui.stageFilter, jobs, anyInView)}</div>}
      </div>
    </div>
  );
}

// 처리 상태 — 신청은 결재 단계, 정책 · 서버 · 로그는 운영자 결정입니다 (1차 판정처럼 결정 전 글이 있으면 그 글).
function stateOf(it: QueueItem): { text: string; tone: string } {
  // 재검토 글(이동 재검토 위험 등)은 AI 등급이 든 글이라 상태 색을 입히지 않습니다.
  if (it.type === "req") return { text: it.sub ?? "", tone: it.raw.grant_review ? "border-line text-ink-soft" : stageTone(it.raw) };
  if (it.decision || !it.sub) return decisionState(it.decision);
  return { text: it.sub, tone: "border-line text-ink-dim" };
}

const MIXED = new Set<ItemType>(["policy", "server"]);
const ROW = "min-h-14 w-full border-0 border-b border-l-[3px] border-b-line border-l-transparent bg-surface py-2 pr-4.5 pl-3.75 text-left";
function Row({ it, split, badge, grid, time, current, onSelect }: { it: QueueItem; split: boolean; badge: boolean; grid: string; time: boolean; current: boolean; onSelect: () => void }) {
  const d = it.decision;
  const sub = d ? `${DECISIONS[d.action]} (${d.decider_name})` : it.sub;
  const state = stateOf(it);
  const tag = [it.typeLabel ?? (MIXED.has(it.type) ? TYPE_LABEL[it.type] : ""), it.id && !it.who.includes(it.id) ? it.id : ""].filter(Boolean).join(" ");
  const cells = (
    <>
      <span className="min-w-0">
        <span className="line-clamp-2 font-semibold leading-[1.35]">{it.who}</span>
        {tag && <small className="mt-0.5 block truncate text-[11px] text-ink-faint tabular-nums">{tag}</small>}
      </span>
      <span className={cn("min-w-0 cursor-pointer", SLIM)} data-tip={it.note ? `${it.what}|${it.note}` : it.what}>
        <span className={cn("block truncate", it.note ? "font-semibold" : "text-ink-soft")}>
          {it.lead && <b className={cn("mr-1", it.level && levelText[it.level])}>{it.lead} —</b>}{it.what}
        </span>
        {it.note && <small className="mt-0.5 block truncate text-[11.5px] text-ink-dim">{it.note}</small>}
      </span>
      {badge && <span className={cn("min-w-0", SLIM)}>{it.badge && <IconBadge icon={it.badge.icon}>{it.badge.text}</IconBadge>}</span>}
      {time && <span className={cn("text-[12.5px] whitespace-nowrap text-ink-dim tabular-nums", SLIM)}>{it.when}</span>}
      <span className="flex flex-col gap-px text-[13px] font-semibold">
        {it.level ? <LevelLabel level={it.level} /> : <span className="flex items-center gap-1.25">{it.judge}</span>}
        {!split && sub && <span className="text-[11px] font-medium text-ink-dim">{sub}</span>}
      </span>
      {split && <StateCell {...state} by={d?.decider_name} />}
    </>
  );
  return (
    <button aria-current={current} onClick={onSelect}
      className={cn(grid, ROW, current ? "border-l-risk bg-risk-tint" : "hover:bg-row-hover")}>
      {cells}
    </button>
  );
}
