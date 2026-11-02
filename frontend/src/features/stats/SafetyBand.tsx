import { safetyTone, statLabel } from "./lib";
import type { Level, SafetyScore } from "@/shared/api/types";
import { activateProps } from "@/shared/lib/hooks";
import { LevelDot } from "@/shared/ui/base/parts";
import { Sparkline } from "@/shared/ui/charts/parts";
import { cn } from "@/shared/lib/cn";
import { levelText, note } from "@/shared/ui/base/styles";

const SCORE = "flex flex-col gap-0.5";
const BIG = "text-[34px] leading-[1.1] font-extrabold tracking-[-1px]";
// 흐름 아래 처음 · 끝 점수는 양 끝에.
const TREND_NOTE = cn(note, "mt-0.5 flex justify-between");

export type SafetyGroup = [name: string, list: { key: string; label: string }[], kind: string, dot: Level | "none"];

// 안전 점수 — 대상마다 마지막 등급의 비율(서버가 셉니다). 아래 묶음은 점수를 깎은 대상이고, 누르면 그 대상의 패널을 엽니다.
export function SafetyBand({ label, safety, groups, onSelect }: { label: string; safety: SafetyScore | null | undefined; groups: SafetyGroup[]; onSelect: (kind: string, key: string) => void }) {
  if (!safety || safety.score == null) {
    return <div className={SCORE}><span className={statLabel}>{label}</span><span className={BIG}>—</span><p className={note}>아직 점검한 대상이 없습니다.</p></div>;
  }
  const t = safety.trend || [];
  const shown = groups.filter(([, list]) => list.length);
  return (
    <>
      <div className={SCORE}><span className={statLabel}>{label}</span><span className={cn(BIG, levelText[safetyTone(safety.score)])}>{safety.score}점</span></div>
      <div className="grid min-w-0 gap-1 text-[13px]">
        {shown.length ? shown.map(([name, list, kind, dot]) => (
          <div key={name} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="min-w-21.5 font-bold"><LevelDot level={dot === "none" ? null : dot} />{name} {list.length}</b>
            {list.map((x) => <span key={x.key} className="min-w-0 cursor-pointer leading-[1.35] font-semibold underline decoration-line underline-offset-[3px] line-clamp-2 hover:decoration-current focus:decoration-current" {...activateProps(() => onSelect(kind, x.key))}>{x.label}</span>)}
          </div>
        )) : <p className={note}>점수를 깎은 대상이 없습니다.</p>}
      </div>
      <div className="phone:col-span-full">
        {t.length > 1 ? (
          <>
            <Sparkline width={(t.length - 1) * 10} height={44} stroke="var(--color-ink-dim)" style={{ width: "100%", height: 44, display: "block" }} ariaLabel={`${label} 흐름`}
              points={t.map((x, n) => [n * 10, 42 - (x.score / 100) * 40])} />
            <p className={TREND_NOTE}><span>{t[0].day.slice(5)} {t[0].score}점</span><span>{t[t.length - 1].day.slice(5)} {t[t.length - 1].score}점</span></p>
          </>
        ) : <p className={TREND_NOTE}>흐름은 이틀 이상 쌓이면 보입니다.</p>}
      </div>
    </>
  );
}
