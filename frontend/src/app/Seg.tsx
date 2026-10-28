import { useMe } from "./me";
import { ROLE_VIEWS, VIEWS } from "./views";
import { useUi } from "./ui/UiContext";
import { useQueue } from "./queue/useQueue";
import { viewCounts } from "./queue/select";

// 사이드바가 없는 좁은 화면의 메뉴. 메뉴가 탭보다 위이므로 어느 탭에서든 보이게 탭 줄 위에 둡니다.
export function Seg() {
  const me = useMe();
  const { ui, navigate } = useUi();
  const views = ROLE_VIEWS[me.role];
  const counts = viewCounts(useQueue(), views, ui.stageFilter, me.role);
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
