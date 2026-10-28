import { useQuery } from "@tanstack/react-query";
import { STAT_PERIODS, STAT_TITLES } from "./constants";
import { SystemHead, SystemSections } from "./SystemStats";
import { UserHead, UserSections } from "./UserStats";
import { useJobs } from "@/app/data";
import { useUi } from "@/app/ui/UiContext";
import { statsQuery, userStatsQuery } from "@/shared/api/queries";
import type { StatPeriod } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { Periods } from "@/shared/ui/Periods";

// 통계 — 보안 통계(stats) · 사용자 위협(ustats)이 같은 화면 · 기간을 쓰고 결과만 따로 받습니다. 막대를 누르면 패널이 열립니다.
export function StatsTab() {
  const { ui, setStats, openDrawer } = useUi();
  const kind = ui.stats.kind ?? "stats";
  const period = ui.stats.period;
  const jobs = useJobs();
  const sys = useQuery({ ...statsQuery(period), enabled: kind === "stats" });
  const usr = useQuery({ ...userStatsQuery(period), enabled: kind === "ustats" });
  const q = kind === "stats" ? sys : usr;
  const d = q.data;
  const range = q.isFetching ? "세는 중…" : q.isError ? q.error.message : d ? (d.since ? `${stamp(d.since)} 부터` : "처음부터") : "";
  const select = (kind: string, key: string) => {
    setStats({ selected: { kind, key } });
    openDrawer();
  };
  return (
    <div className="stats-view" id="view-stats" role="tabpanel" aria-labelledby="tab-stats" style={{ opacity: q.isFetching && d ? 0.55 : undefined }}>
      <section className="card">
        <div className="logs-head">
          <h3 id="stat-title">{STAT_TITLES[kind]}</h3>
          <Periods<StatPeriod> id="stat-periods" labels={STAT_PERIODS} value={period} onChange={(p) => { if (p !== period) setStats({ period: p }); }} />
          <span className="logs-count" id="stat-range">{range}</span>
        </div>
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

// 받기 전에는 자리만 (.safety:empty 가 공간을 접습니다).
const EmptyHead = () => <><div className="safety" id="stat-safety" /><div className="tiles" id="stat-tiles" /></>;
