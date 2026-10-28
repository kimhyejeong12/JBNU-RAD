import { useQuery } from "@tanstack/react-query";
import { useUi } from "@/app/ui/UiContext";
import { statsQuery, userStatsQuery } from "@/shared/api/queries";

// 보안 통계 · 사용자 위협은 같은 기간을 쓰고 지금 보는 종류만 받습니다. 탭과 패널이 같은 쿼리를 봅니다.
export function useStatsData() {
  const { ui } = useUi();
  const kind = ui.stats.kind ?? "stats";
  const period = ui.stats.period;
  const sys = useQuery({ ...statsQuery(period), enabled: kind === "stats" });
  const usr = useQuery({ ...userStatsQuery(period), enabled: kind === "ustats" });
  return { kind, period, sys, usr };
}
