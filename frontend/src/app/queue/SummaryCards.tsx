import { useMe } from "@/app/session/me";
import { LEVEL_VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "./useQueue";
import { inView } from "./select";
import type { Level } from "@/shared/api/types";
import { LEVELS, LEVEL_TIP } from "@/shared/lib/labels";
import { LevelDot } from "@/shared/ui/base/parts";

// 요약 카드 — 숫자는 지금 보고 있는 메뉴를 따라 아래 목록과 맞추고, 누르면 그 등급만 봅니다.
// 등급이 없는 메뉴(내 신청 · 계정)는 카드를 숨기고, 로그 감시는 주의 이상만 검토에 올라오므로 정상 카드를 두지 않습니다.
export function SummaryCards() {
  const me = useMe();
  const { ui, toggleFilter } = useUi();
  const items = useQueue();
  const view = ui.view;
  if (!view || !LEVEL_VIEWS.has(view)) return <section className="stats" id="stats" hidden />;
  const shown = items.filter((it) => inView(it, view, ui.stageFilter, me.role));
  const levels: Level[] = view === "events" ? ["주의", "위험"] : [...LEVELS];
  return (
    <section className="stats" id="stats" style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}>
      {levels.map((l) => (
        <button key={l} className={`card stat ${l}`} aria-pressed={ui.filter === l} data-tip={LEVEL_TIP[l]} onClick={() => toggleFilter(l)}>
          <span className="label"><LevelDot level={l} />{l}</span>
          <span className="num">{shown.filter((it) => it.level === l).length}</span>
        </button>
      ))}
    </section>
  );
}
