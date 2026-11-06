import { Fragment } from "react";
import { useMe, useViews } from "@/app/session/me";
import { VIEWS, isAdminView, navGroups } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "@/app/queue/useQueue";
import { todoCounts } from "@/app/queue/select";
import { cn } from "@/shared/lib/cn";

const TOP_NAV = "flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-[8px] border-none bg-transparent px-3 text-[13.5px] font-semibold text-bar-ink hover:bg-bar-hover hover:text-white aria-[current=true]:bg-white aria-[current=true]:text-ink";

// 메뉴를 위 막대에 둡니다. 좁은 화면에서는 막대 아래 줄로 내려가 옆으로 밉니다.
export function TopNav() {
  const me = useMe();
  const { ui, navigate, openAdmin } = useUi();
  const views = useViews();
  const counts = useViewCounts();
  if (views.length < 2) return null;
  const top = me.role === "top";
  const btn = (key: string, label: string, current: boolean, onClick: () => void, count?: number) => (
    <button key={key} className={TOP_NAV} data-view={key} aria-current={current} onClick={onClick}>
      {label}
      {count ? <span className={cn("rounded-[99px] px-1.75 text-[11.5px] tabular-nums", current ? "bg-risk-tint text-risk" : "bg-risk text-white")}>{count}</span> : null}
    </button>
  );
  return (
    <nav aria-label="메뉴" id="top-nav" className="flex min-w-0 items-center gap-1 overflow-x-auto narrow:order-last narrow:w-full">
      {navGroups(views).map(([group, list], i) => (
        <Fragment key={group}>
          {i > 0 && <Divider />}
          {list.filter((v) => !(top && isAdminView(v))).map((v) => btn(v, VIEWS[v].label, ui.view === v, () => navigate(v), counts[v]))}
        </Fragment>
      ))}
      {(top || me.role === "manager") && <Divider />}
      {top && btn("admin", "관리", isAdminView(ui.view), openAdmin)}
      {me.role === "manager" && btn("docs", "기준 문서", ui.view === "docs", () => navigate("docs"))}
    </nav>
  );
}

const Divider = () => <span className="mx-1.5 h-5 w-px flex-none bg-bar-line" aria-hidden="true" />;

function useViewCounts(): Record<string, number> {
  return todoCounts(useQueue(), useViews(), useMe().role);
}
