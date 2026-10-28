import { safetyTone } from "./lib";
import type { Level, SafetyScore } from "@/shared/api/types";
import { activateProps } from "@/shared/lib/hooks";
import { LevelDot } from "@/shared/ui/LevelDot";
import { Sparkline } from "@/shared/ui/charts/parts";

export type SafetyGroup = [name: string, list: { key: string; label: string }[], kind: string, dot: Level | "none"];

// 안전 점수 — 대상마다 마지막 등급의 비율(서버가 셉니다). 아래 묶음은 점수를 깎은 대상이고, 누르면 그 대상의 패널을 엽니다.
export function SafetyBand({ label, safety, groups, onSelect }: { label: string; safety: SafetyScore | null | undefined; groups: SafetyGroup[]; onSelect: (kind: string, key: string) => void }) {
  if (!safety || safety.score == null) {
    return <div className="score"><span className="label">{label}</span><span className="big">—</span><p className="note">아직 점검한 대상이 없습니다.</p></div>;
  }
  const t = safety.trend || [];
  const shown = groups.filter(([, list]) => list.length);
  return (
    <>
      <div className="score"><span className="label">{label}</span><span className={`big ${safetyTone(safety.score)}`}>{safety.score}점</span></div>
      <div className="groups">
        {shown.length ? shown.map(([name, list, kind, dot]) => (
          <div key={name}>
            <b><LevelDot level={dot === "none" ? null : dot} />{name} {list.length}</b>
            {list.map((x) => <span key={x.key} className="who" {...activateProps(() => onSelect(kind, x.key))}>{x.label}</span>)}
          </div>
        )) : <p className="note">점수를 깎은 대상이 없습니다.</p>}
      </div>
      <div className="trend">
        {t.length > 1 ? (
          <>
            <Sparkline width={(t.length - 1) * 10} height={44} stroke="var(--ink-dim)" ariaLabel={`${label} 흐름`}
              points={t.map((x, n) => [n * 10, 42 - (x.score / 100) * 40])} />
            <p className="note"><span>{t[0].day.slice(5)} {t[0].score}점</span><span>{t[t.length - 1].day.slice(5)} {t[t.length - 1].score}점</span></p>
          </>
        ) : <p className="note">흐름은 이틀 이상 쌓이면 보입니다.</p>}
      </div>
    </>
  );
}
