import { useMe } from "@/app/session/me";
import { LEVEL_VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "./useQueue";
import { inView } from "./select";
import type { Level } from "@/shared/api/types";
import { LEVELS, LEVEL_TIP } from "@/shared/lib/labels";
import { LevelDot } from "@/shared/ui/base/parts";
import { cn } from "@/shared/lib/cn";
import { card, levelText } from "@/shared/ui/base/styles";

// 누른 카드(그 등급만 보는 중)는 등급 색 테두리 · 바탕. 누르지 않은 카드는 hover 때만 테두리가 짙어집니다.
const PRESSED: Record<Level, string> = {
  "정상": "border-ok bg-ok-tint",
  "주의": "border-warn bg-warn-tint",
  "위험": "border-risk bg-risk-tint",
};

// 요약 카드 — 숫자는 지금 보고 있는 메뉴를 따라 아래 목록과 맞추고, 누르면 그 등급만 봅니다.
// 등급이 없는 메뉴(내 신청 · 계정)는 카드를 숨기고, 로그 감시는 주의 이상만 검토에 올라오므로 정상 카드를 두지 않습니다.
export function SummaryCards() {
  const me = useMe();
  const { ui, toggleFilter } = useUi();
  const items = useQueue();
  const view = ui.view;
  if (!view || !LEVEL_VIEWS.has(view)) return <section id="stats" hidden />;
  const shown = items.filter((it) => inView(it, view, ui.stageFilter, me.role));
  const levels: Level[] = view === "events" ? ["주의", "위험"] : [...LEVELS];
  return (
    <section className="grid gap-3" id="stats" style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}>
      {levels.map((l) => (
        <button key={l} aria-pressed={ui.filter === l} data-tip={LEVEL_TIP[l]} onClick={() => toggleFilter(l)}
          className={cn(card, "w-full px-4 py-[14px] text-left", ui.filter === l ? PRESSED[l] : "hover:border-ink-dim")}>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-dim"><LevelDot level={l} className="mr-0" />{l}</span>
          <span className={cn("block text-[26px] leading-[1.25] font-extrabold tracking-[-0.8px] tabular-nums", levelText[l])}>{shown.filter((it) => it.level === l).length}</span>
        </button>
      ))}
    </section>
  );
}
