import { Fragment } from "react";
import { useMe, useViews } from "@/app/session/me";
import { VIEWS, isAdminView, navGroups } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "@/app/queue/useQueue";
import { todoCounts } from "@/app/queue/select";

// 선택된 메뉴는 아래 빨간 줄 — 위 막대 높이를 이 버튼이 정해서 줄이 막대 바닥에 붙습니다.
const TOP_NAV = "flex h-13 flex-none items-center gap-1.5 whitespace-nowrap border-0 border-y-[3px] border-transparent bg-transparent px-3 text-[13.5px] font-semibold text-bar-ink hover:text-white aria-[current=true]:border-b-brand-red aria-[current=true]:text-white narrow:h-10";

// 메뉴를 위 막대에 둡니다. 좁은 화면에서는 막대 아래 줄로 내려가 옆으로 밉니다.
export function TopNav() {
  const { ui, navigate, openAdmin } = useUi();
  const views = useViews();
  const counts = useViewCounts();
  if (views.length < 2) return null;
  const btn = (key: string, label: string, current: boolean, onClick: () => void, count?: number) => (
    <button key={key} className={TOP_NAV} data-view={key} aria-current={current} onClick={onClick}>
      {label}
      {count ? <span className="rounded-[99px] bg-risk px-1.75 text-[11.5px] tabular-nums text-white">{count}</span> : null}
    </button>
  );
  return (
    <nav aria-label="메뉴" id="top-nav" className="flex min-w-0 items-center gap-1 overflow-x-auto narrow:order-last narrow:w-full">
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

const Divider = () => <span className="mx-1.5 h-5 w-px flex-none bg-bar-line" aria-hidden="true" />;

function useViewCounts(): Record<string, number> {
  return todoCounts(useQueue(), useViews(), useMe().role);
}
