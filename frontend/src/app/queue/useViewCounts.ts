import { useQueue } from "./useQueue";
import { viewCounts } from "./select";
import { useMe, useViews } from "@/app/me";
import { useUi } from "@/app/ui/UiContext";

// 메뉴별 건수 — 사이드바 툴팁과 좁은 화면의 세그먼트가 같이 씁니다.
export function useViewCounts(): Record<string, number> {
  const me = useMe();
  const { ui } = useUi();
  return viewCounts(useQueue(), useViews(), ui.stageFilter, me.role);
}
