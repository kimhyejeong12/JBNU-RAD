import { useState } from "react";
import { STAT_TITLES, useStatsData, type StatView } from "./lib";
import { SystemHead, SystemSections } from "./SystemStats";
import { UserHead, UserSections } from "./UserStats";
import { useJobs } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import type { StatPeriod } from "@/shared/api/types";
import { Periods, CardHead } from "@/shared/ui/parts";
import { cardCount, cardCol } from "@/shared/ui/styles";
import { cn } from "@/shared/lib/cn";
import { STAT_PERIODS } from "@/shared/lib/labels";
import { rangeText } from "@/shared/lib/format";

// 고른 타일은 탭마다 따로 — 탭을 바꾸면 풀림
export function StatsTab() {
  const { kind } = useStatsData();
  return <StatsView key={kind} />;
}

// 위 = 안전 점수 머리(등급 줄을 누르면 아래 표를 거름), 아래 = 그래프 · 표
function StatsView() {
  const { ui, setStats, openDrawer } = useUi();
  const { kind, period, sys, usr } = useStatsData();
  const jobs = useJobs();
  const [pick, setPick] = useState<string | null>(null);
  const q = kind === "stats" ? sys : usr;
  const select = (kind: string, key: string) => {
    const s = ui.stats.selected;
    if (s && s.kind === kind && s.key === key) return setStats({ selected: null });
    setStats({ selected: { kind, key } });
    openDrawer();
  };
  const view: StatView = { selected: ui.stats.selected, onSelect: select, pick, onPick: (k) => setPick(pick === k ? null : k) };
  return (
    <div className={cn("flex flex-col gap-3.5", q.isFetching && q.data && "opacity-55")} id="view-stats" role="tabpanel" aria-labelledby="tab-stats">
      <section className={cardCol}>
        <CardHead title={STAT_TITLES[kind]} id="stat-title">
          <Periods<StatPeriod> id="stat-periods" labels={STAT_PERIODS} value={period} onChange={(p) => { if (p !== period) setStats({ period: p }); }} />
          <span className={cardCount} id="stat-range">{rangeText(q)}</span>
        </CardHead>
        {kind === "stats" ? sys.data && <SystemHead d={sys.data} {...view} /> : usr.data && <UserHead d={usr.data} {...view} />}
      </section>
      {kind === "stats" ? sys.data && <SystemSections d={sys.data} {...view} /> : usr.data && <UserSections d={usr.data} {...view} jobs={jobs} />}
    </div>
  );
}
