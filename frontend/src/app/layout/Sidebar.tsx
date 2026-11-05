import { Fragment } from "react";
import { useMe, useViews } from "@/app/session/me";
import { VIEWS, isAdminView, navGroups } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { Icon } from "@/shared/ui/base/Icon";
import { useQueue } from "@/app/queue/useQueue";
import { todoCounts } from "@/app/queue/select";
import { cn } from "@/shared/lib/cn";

const NAV = "flex h-10 w-10 items-center justify-center rounded-[9px] border-none bg-transparent text-ink-dim";
const ROW = "flex h-10 w-full items-center gap-2.5 rounded-[9px] border-none bg-transparent px-3 text-left text-[13.5px] font-semibold text-ink-dim";
const navTone = (current: boolean) => (current ? "bg-risk-tint text-risk" : "hover:bg-canvas hover:text-ink");

export function Sidebar({ wide, onToggle }: { wide: boolean; onToggle: () => void }) {
  const me = useMe();
  const { ui, navigate, openAdmin } = useUi();
  const views = useViews();
  const counts = useViewCounts();
  const item = (key: string, icon: string, label: string, opts: { current?: boolean; count?: number; tip?: string; iconClass?: string; onClick: () => void; id?: string; view?: string }) =>
    wide ? (
      <button key={key} id={opts.id} className={cn(ROW, navTone(!!opts.current))} data-view={opts.view} aria-current={opts.view ? !!opts.current : undefined} onClick={opts.onClick}>
        <Icon name={icon} className={opts.iconClass} /><span className="min-w-0 flex-1 truncate">{label}</span>
        {opts.count ? <span className={cn("rounded-[99px] px-1.75 text-[11.5px] tabular-nums", opts.current ? "bg-surface" : "bg-canvas")}>{opts.count}</span> : null}
      </button>
    ) : (
      <button key={key} id={opts.id} className={cn(NAV, navTone(!!opts.current))} data-view={opts.view} aria-label={label} aria-current={opts.view ? !!opts.current : undefined}
        data-tip-pos="right" data-tip={opts.tip ?? label} onClick={opts.onClick}>
        <Icon name={icon} className={opts.iconClass} />
      </button>
    );
  return (
    <nav data-tip-instant aria-label="메뉴"
      className={cn("row-start-2 flex flex-col gap-1.5 border-r border-line bg-surface py-3.5 narrow:hidden", wide ? "px-3" : "items-center px-0", views.length < 2 && "hidden")}>
      <div className="flex flex-col gap-1.5" id="nav-views">
        {navGroups(views).map(([group, list], i) => (
          <Fragment key={group}>
            {wide
              ? <span className={cn("px-3 text-[11px] font-semibold text-ink-faint", i > 0 && "pt-2.5")}>{group}</span>
              : i > 0 && <span className="mx-auto my-1 h-px w-6 bg-line" aria-hidden="true" />}
            {list.map((v) => item(v, VIEWS[v].icon, VIEWS[v].label, {
              view: v, current: ui.view === v, count: counts[v], onClick: () => navigate(v),
              tip: counts[v] ? `${VIEWS[v].tip}|처리할 일 ${counts[v]}건` : VIEWS[v].tip,
            }))}
          </Fragment>
        ))}
      </div>
      <div className={cn("mt-auto flex flex-col gap-1.5", !wide && "items-center")}>
        {/* 관리는 처리할 일이 아니라 건수를 달지 않습니다. */}
        {me.role === "top" && item("admin", "gear", "관리", {
          id: "nav-admin", view: "admin", current: isAdminView(ui.view), tip: "관리|권한 목록 · 계정 관리 · 기준 문서 · 큐", onClick: openAdmin,
        })}
        {me.role === "manager" && item("docs", "book", "기준 문서", { id: "nav-docs", view: "docs", current: ui.view === "docs", tip: "기준 문서", onClick: () => navigate("docs") })}
        {item("toggle", "chev", wide ? "메뉴 접기" : "메뉴 펼치기", { id: "nav-toggle", iconClass: cn(wide && "rotate-180"), onClick: onToggle })}
      </div>
    </nav>
  );
}

// 메뉴가 탭보다 위라 어느 탭에서든 보이게 탭 줄 위에 둡니다.
export function Seg() {
  const me = useMe();
  const { ui, navigate, openAdmin } = useUi();
  const views = useViews();
  const counts = useViewCounts();
  const top = me.role === "top";
  return (
    <div className="hidden self-start rounded-lg bg-canvas p-0.75 narrow:flex" role="tablist" id="seg" aria-label="메뉴" hidden={views.length < 2}>
      {views.filter((v) => !(top && isAdminView(v))).map((v) => (
        <button key={v} role="tab" aria-selected={ui.view === v} onClick={() => navigate(v)} className={SEG}>
          {VIEWS[v].label}{" "}<span data-count={v}>{counts[v] || ""}</span>
        </button>
      ))}
      {top && <button role="tab" aria-selected={isAdminView(ui.view)} onClick={openAdmin} className={SEG}>관리</button>}
    </div>
  );
}

const SEG = "rounded-md border-none bg-transparent px-3 py-1.25 text-[12.5px] font-semibold text-ink-dim aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-[0_1px_2px_rgba(0,0,0,.08)]";

function useViewCounts(): Record<string, number> {
  return todoCounts(useQueue(), useViews(), useMe().role);
}
