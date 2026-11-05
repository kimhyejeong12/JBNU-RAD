import { useQuery } from "@tanstack/react-query";
import { useUi } from "@/app/ui/state/UiContext";
import { statsQuery, userStatsQuery } from "@/shared/api/queries";

export function useStatsData() {
  const { ui } = useUi();
  const kind = ui.stats.kind ?? "stats";
  const period = ui.stats.period;
  const sys = useQuery({ ...statsQuery(period), enabled: kind === "stats" });
  const usr = useQuery({ ...userStatsQuery(period), enabled: kind === "ustats" });
  return { kind, period, sys, usr };
}
