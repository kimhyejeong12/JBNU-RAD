import { useMe, useViews } from "@/app/session/me";
import { VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { Icon } from "@/shared/ui/base/Icon";
import { useQueue } from "@/app/queue/useQueue";
import { viewCounts } from "@/app/queue/select";

// 넓은 화면의 메뉴 — 건수는 세그먼트가 없으므로 툴팁 제목에 붙입니다.
export function Sidebar({ onDocs }: { onDocs: () => void }) {
  const me = useMe();
  const { ui, navigate } = useUi();
  const views = useViews();
  const counts = useViewCounts();
  return (
    <nav className="sidebar" aria-label="메뉴">
      <div className="nav-views" id="nav-views">
        {views.map((v) => (
          <button key={v} className="nav" data-view={v} aria-label={VIEWS[v].label} aria-current={ui.view === v} data-tip-pos="right"
            data-tip={v in counts ? `${VIEWS[v].tip} ${counts[v]}건` : VIEWS[v].tip} onClick={() => navigate(v)}>
            <Icon name={VIEWS[v].icon} />
          </button>
        ))}
      </div>
      <button className="nav" id="nav-docs" aria-label="기준 문서 원문" data-tip-pos="right" data-tip="기준 문서 원문" hidden={me.role === "user"} onClick={onDocs}>
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
    <div className="seg" role="tablist" id="seg" aria-label="메뉴" hidden={views.length < 2}>
      {views.map((v) => (
        <button key={v} role="tab" aria-selected={ui.view === v} onClick={() => navigate(v)}>
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
