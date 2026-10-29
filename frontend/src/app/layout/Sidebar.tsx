import { useMe, useViews } from "@/app/session/me";
import { VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { Icon } from "@/shared/ui/base/Icon";
import { useQueue } from "@/app/queue/useQueue";
import { viewCounts } from "@/app/queue/select";
import { cn } from "@/shared/lib/cn";

// 메뉴 버튼 — 지금 메뉴는 빨간 바탕, 나머지는 hover 때 회색 바탕.
const NAV = "flex h-10 w-10 items-center justify-center rounded-[9px] border-none bg-transparent text-ink-dim";
const navTone = (current: boolean) => (current ? "bg-risk-tint text-risk" : "hover:bg-canvas hover:text-ink");

// 넓은 화면의 메뉴 — 건수는 세그먼트가 없으므로 툴팁 제목에 붙입니다. 메뉴가 하나뿐이면(일반 사용자) 그리지 않습니다.
// 툴팁이 곧바로 뜨는 구역입니다 (data-tip-instant).
export function Sidebar({ onDocs }: { onDocs: () => void }) {
  const me = useMe();
  const { ui, navigate } = useUi();
  const views = useViews();
  const counts = useViewCounts();
  return (
    <nav data-tip-instant aria-label="메뉴"
      className={cn("row-start-2 flex flex-col items-center gap-1.5 border-r border-line bg-surface px-0 py-3.5 narrow:hidden", views.length < 2 && "hidden")}>
      <div className="flex flex-col gap-1.5" id="nav-views">
        {views.map((v) => (
          <button key={v} className={cn(NAV, navTone(ui.view === v))} data-view={v} aria-label={VIEWS[v].label} aria-current={ui.view === v} data-tip-pos="right"
            data-tip={v in counts ? `${VIEWS[v].tip} ${counts[v]}건` : VIEWS[v].tip} onClick={() => navigate(v)}>
            <Icon name={VIEWS[v].icon} />
          </button>
        ))}
      </div>
      <button className={cn(NAV, navTone(false))} id="nav-docs" aria-label="기준 문서 원문" data-tip-pos="right" data-tip="기준 문서 원문" hidden={me.role === "user"} onClick={onDocs}>
        <Icon name="book" />
      </button>
    </nav>
  );
}

// 사이드바가 없는 좁은 화면의 메뉴. 메뉴가 탭보다 위이므로 어느 탭에서든 보이게 탭 줄 위에 둡니다.
export function Seg() {
  const { ui, navigate } = useUi();
  const views = useViews();
  const counts = useViewCounts();
  return (
    <div className="hidden self-start rounded-lg bg-canvas p-0.75 narrow:flex" role="tablist" id="seg" aria-label="메뉴" hidden={views.length < 2}>
      {views.map((v) => (
        <button key={v} role="tab" aria-selected={ui.view === v} onClick={() => navigate(v)}
          className="rounded-md border-none bg-transparent px-3 py-1.25 text-[12.5px] font-semibold text-ink-dim aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-[0_1px_2px_rgba(0,0,0,.08)]">
          {VIEWS[v].label}{" "}<span data-count={v}>{counts[v] ?? ""}</span>
        </button>
      ))}
    </div>
  );
}

// 메뉴별 건수 — 사이드바 툴팁과 좁은 화면의 세그먼트가 같이 씁니다.
function useViewCounts(): Record<string, number> {
  const me = useMe();
  const { ui } = useUi();
  return viewCounts(useQueue(), useViews(), ui.stageFilter, me.role);
}
