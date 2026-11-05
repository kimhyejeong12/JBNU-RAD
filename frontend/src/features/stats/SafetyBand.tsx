import { Fragment } from "react";
import { safetyTone, statLabel } from "./lib";
import type { Level, SafetyScore } from "@/shared/api/types";
import { activateProps } from "@/shared/lib/hooks";
import { LevelDot } from "@/shared/ui/base/parts";
import { Sparkline } from "@/shared/ui/charts/parts";
import { cn } from "@/shared/lib/cn";
import { levelText, note } from "@/shared/ui/base/styles";

const SCORE = "flex flex-col gap-0.5";
const BIG = "text-[34px] leading-[1.1] font-extrabold tracking-[-1px]";
const TREND_NOTE = cn(note, "mt-0.5 flex justify-between");

export type SafetyGroup = [name: string, list: { key: string; label: string }[], kind: string, dot: Level | "none"];

export function SafetyBand({ label, safety, groups, onSelect, names = 3 }: { label: string; safety: SafetyScore | null | undefined; groups: SafetyGroup[]; onSelect: (kind: string, key: string) => void; names?: number }) {
  if (!safety || safety.score == null) {
    return <div className={SCORE}><span className={statLabel}>{label}</span><span className={BIG}>—</span><p className={note}>아직 점검한 대상이 없습니다.</p></div>;
  }
  const t = safety.trend || [];
  const shown = groups.filter(([, list]) => list.length);
  return (
    <>
      <div className={SCORE}><span className={statLabel}>{label}</span><span className={cn(BIG, levelText[safetyTone(safety.score)])}>{safety.score}점</span></div>
      <div className="grid min-w-0 gap-1.5 text-[13px]">
        {shown.length ? shown.map(([name, list, kind, dot]) => (
          // 옆에 두면 13인치에서 이름 칸이 좁아 잘려서 묶음 이름 아래 줄에 둡니다.
          <div key={name} className="min-w-0">
            <b className="font-bold"><LevelDot level={dot === "none" ? null : dot} />{name} {list.length}</b>
            {names > 0 && (
              <span className="block truncate pl-4">
                {list.slice(0, names).map((x, i) => (
                  <Fragment key={x.key}>{i > 0 && ", "}<span className="cursor-pointer font-semibold underline decoration-line underline-offset-[3px] hover:decoration-current focus:decoration-current" {...activateProps(() => onSelect(kind, x.key))}>{x.label}</span></Fragment>
                ))}
                {list.length > names && <span className="text-ink-dim"> 외 {list.length - names}</span>}
              </span>
            )}
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
