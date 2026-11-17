import { STAT_PERIODS, STAT_TITLES, statSafety, useStatsData } from "./lib";
import { SystemHead, SystemSections } from "./SystemStats";
import { UserHead, UserSections } from "./UserStats";
import { useJobs } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import type { StatPeriod } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { Periods, CardHead } from "@/shared/ui/parts";
import { cardCount, cardCol, tileGrid } from "@/shared/ui/styles";
import { cn } from "@/shared/lib/cn";

export function StatsTab() {
  const { ui, setStats, openDrawer } = useUi();
  const { kind, period, sys, usr } = useStatsData();
  const jobs = useJobs();
  const q = kind === "stats" ? sys : usr;
  const d = q.data;
  const range = q.isFetching ? "세는 중…" : q.isError ? q.error.message : d ? (d.since ? `${stamp(d.since)} 부터` : "처음부터") : "";
  const select = (kind: string, key: string) => {
    const s = ui.stats.selected;
    if (s && s.kind === kind && s.key === key) return setStats({ selected: null });
    setStats({ selected: { kind, key } });
    openDrawer();
  };
  return (
    <div className={cn("flex flex-col gap-3.5", q.isFetching && d && "opacity-55")} id="view-stats" role="tabpanel" aria-labelledby="tab-stats">
      <section className={cardCol}>
        <CardHead title={STAT_TITLES[kind]} id="stat-title">
          <Periods<StatPeriod> id="stat-periods" labels={STAT_PERIODS} value={period} onChange={(p) => { if (p !== period) setStats({ period: p }); }} />
          <span className={cardCount} id="stat-range">{range}</span>
        </CardHead>
        {kind === "stats"
          ? sys.data ? <SystemHead d={sys.data} selected={ui.stats.selected} onSelect={select} /> : <EmptyHead />
          : usr.data ? <UserHead d={usr.data} selected={ui.stats.selected} onSelect={select} /> : <EmptyHead />}
      </section>
      {kind === "stats"
        ? sys.data && <SystemSections d={sys.data} selected={ui.stats.selected} onSelect={select} />
        : usr.data && <UserSections d={usr.data} selected={ui.stats.selected} onSelect={select} jobs={jobs} />}
    </div>
  );
}

const EmptyHead = () => <><div className={statSafety} id="stat-safety" /><div className={tileGrid} id="stat-tiles" /></>;
