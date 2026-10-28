import { useMe } from "./me";
import { ROLE_VIEWS, VIEWS } from "./views";
import { useUi } from "./ui/UiContext";
import { useQueue } from "./queue/useQueue";
import { viewCounts } from "./queue/select";
import { Icon } from "@/shared/ui/Icon";

// 넓은 화면의 메뉴 — 건수는 세그먼트가 없으므로 툴팁 제목에 붙입니다.
export function Sidebar({ onDocs }: { onDocs: () => void }) {
  const me = useMe();
  const { ui, navigate } = useUi();
  const views = ROLE_VIEWS[me.role];
  const counts = viewCounts(useQueue(), views, ui.stageFilter, me.role);
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
