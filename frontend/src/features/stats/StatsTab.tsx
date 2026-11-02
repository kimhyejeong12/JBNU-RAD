import { STAT_PERIODS, STAT_TITLES, statCard, statSafety, statTiles } from "./lib";
import { SystemHead, SystemSections } from "./SystemStats";
import { UserHead, UserSections } from "./UserStats";
import { useStatsData } from "./useStatsData";
import { useJobs } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import type { StatPeriod } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { Periods } from "@/shared/ui/base/parts";
import { cardCount, cardHead, cardTitle } from "@/shared/ui/base/styles";

// 통계 — 보안 통계(stats) · 사용자 위협(ustats)이 같은 화면 · 기간을 쓰고 결과만 따로 받습니다. 막대를 누르면 패널이 열립니다.
export function StatsTab() {
  const { ui, setStats, openDrawer } = useUi();
  const { kind, period, sys, usr } = useStatsData();
  const jobs = useJobs();
  const q = kind === "stats" ? sys : usr;
  const d = q.data;
  const range = q.isFetching ? "세는 중…" : q.isError ? q.error.message : d ? (d.since ? `${stamp(d.since)} 부터` : "처음부터") : "";
  // 고른 막대 · 줄을 다시 누르면 선택을 풉니다.
  const select = (kind: string, key: string) => {
    const s = ui.stats.selected;
    if (s && s.kind === kind && s.key === key) return setStats({ selected: null });
    setStats({ selected: { kind, key } });
    openDrawer();
  };
  return (
    <div className="flex flex-col gap-3.5" id="view-stats" role="tabpanel" aria-labelledby="tab-stats" style={{ opacity: q.isFetching && d ? 0.55 : undefined }}>
      <section className={statCard}>
        <div className={cardHead}>
          <h3 className={cardTitle} id="stat-title">{STAT_TITLES[kind]}</h3>
          <Periods<StatPeriod> id="stat-periods" labels={STAT_PERIODS} value={period} onChange={(p) => { if (p !== period) setStats({ period: p }); }} />
          <span className={cardCount} id="stat-range">{range}</span>
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

// 받기 전에는 자리만 — 빈 안전 점수 띠는 접히고, 타일 자리는 아래 여백만 남습니다.
const EmptyHead = () => <><div className={statSafety} id="stat-safety" /><div className={statTiles} id="stat-tiles" /></>;
