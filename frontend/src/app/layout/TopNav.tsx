import { Fragment } from "react";
import { useMe, useViews } from "@/app/session/me";
import { VIEWS, isAdminView, navGroups } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "@/app/queue/useQueue";
import { todoCounts } from "@/app/queue/select";

// 선택된 메뉴는 아래 빨간 줄 — 버튼이 위 막대 높이를 다 채워서 줄이 막대 바닥에 붙습니다.
const TOP_NAV = "flex h-full flex-none items-center gap-1.5 whitespace-nowrap border-0 border-y-3 border-transparent bg-transparent px-4 text-[15px] font-medium text-bar-line-hover hover:text-bar-ink aria-[current=true]:border-b-brand-red aria-[current=true]:bg-white/5 aria-[current=true]:text-white narrow:h-12";

// 메뉴를 위 막대에 둡니다. 좁은 화면에서는 막대 아래 줄로 내려가 옆으로 밉니다.
export function TopNav() {
  const { ui, navigate, openAdmin } = useUi();
  const views = useViews();
  const counts = useViewCounts();
  if (views.length < 2) return null;
  const btn = (key: string, label: string, current: boolean, onClick: () => void, count?: number) => (
    <button key={key} className={TOP_NAV} data-view={key} aria-current={current} onClick={onClick}>
      {label}
      {count ? <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-risk px-0.5 text-[11px] font-bold tabular-nums text-white">{count}</span> : null}
    </button>
  );
  return (
    <nav aria-label="메뉴" id="top-nav" className="flex h-full min-w-0 items-center overflow-x-auto narrow:order-last narrow:h-auto narrow:w-full">
      {navGroups(views).map(([group, list], i) => (
        <Fragment key={group}>
          {i > 0 && <Divider />}
          {list.filter((v) => !isAdminView(v)).map((v) => btn(v, VIEWS[v].label, ui.view === v, () => navigate(v), counts[v]))}
        </Fragment>
      ))}
      <Divider />
      {btn("admin", "관리", isAdminView(ui.view), openAdmin)}
    </nav>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px flex-none bg-bar-line" aria-hidden="true" />;

function useViewCounts(): Record<string, number> {
  return todoCounts(useQueue(), useViews(), useMe().role);
}
