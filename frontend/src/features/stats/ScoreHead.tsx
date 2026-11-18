import { safetyTone, scoreDelta } from "./lib";
import type { Level, SafetyScore } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { LevelDot } from "@/shared/ui/parts";
import { Sparkline } from "@/shared/ui/charts";
import { levelText, note } from "@/shared/ui/styles";

// 오른쪽 줄 — pick 이 있으면 누르는 줄(아래 표를 거름), 없으면 글 줄. dot 은 등급 점(null 이면 회색), tone 은 숫자 색, none 은 거를 것이 없는 줄(흐리게 하지 않고 누르지만 못함)
interface ScoreRow { pick?: string; dot?: Level | null; label: string; value: string; sub?: string; tone?: string; none?: boolean }

const BIG = "text-[38px] leading-[1.1] font-extrabold tracking-[-1px] tabular-nums";
const ROW = "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px]";
const ROW_BUTTON = cn(ROW, "border-line bg-surface hover:bg-row-hover aria-pressed:border-brand aria-pressed:bg-brand-soft disabled:cursor-default disabled:hover:bg-surface");

// 시스템 · 사용자 탭 머리 — 왼쪽 큰 안전 점수와 흐름, 오른쪽 등급별 수(누르면 표를 거르고 다시 누르면 풂)
// 종합 대시보드 · 권한 변동의 타일 줄과 달리 "점수를 보는 탭"임이 바로 보이게 함
export function ScoreHead({ label, safety, none, rows, pick, onPick }: {
  label: string; safety: SafetyScore | null | undefined; none: string; rows: ScoreRow[]; pick: string | null; onPick: (k: string) => void;
}) {
  const t = safety?.trend ?? [];
  const score = safety?.score;
  return (
    <div className="grid grid-cols-[minmax(220px,2fr)_minmax(0,3fr)] gap-5 px-4.5 pb-4 phone:grid-cols-1 phone:gap-3" id="stat-head">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[12.5px] font-semibold text-ink-dim">{label}</span>
        {score == null ? <><b className={BIG}>—</b><p className={note}>{none}</p></> : (
          <>
            <p className="m-0 flex flex-wrap items-baseline gap-x-2.5">
              <b className={cn(BIG, levelText[safetyTone(score)])}>{score}점</b><span className="text-[12.5px] text-ink-dim">{scoreDelta(t)}</span>
            </p>
            {t.length > 1 && (
              <>
                <Sparkline scores={t.map((x) => x.score)} height={40} stroke="var(--color-ink-dim)" className="mt-1 block" ariaLabel={`${label} 흐름`} />
                <p className={cn(note, "mt-0 flex justify-between tabular-nums")}>
                  <span>{t[0].day.slice(5)} {t[0].score}점</span><span>{t[t.length - 1].day.slice(5)} {t[t.length - 1].score}점</span>
                </p>
              </>
            )}
          </>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-2 content-start gap-2 border-l border-line pl-5 phone:grid-cols-1 phone:border-t phone:border-l-0 phone:pt-3 phone:pl-0">
        {rows.map((r) => {
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="flex items-center font-semibold">{r.dot !== undefined && <LevelDot level={r.dot} />}{r.label}</span>
                {r.sub && <small className="block text-[12px] text-ink-dim">{r.sub}</small>}
              </span>
              <b className={cn("flex-none text-[15px] tabular-nums", r.tone)}>{r.value}</b>
            </>
          );
          return r.pick
            // 고른 채로 0이 되면 풀 수 있게 고른 줄은 막지 않음
            ? <button type="button" key={r.label} className={ROW_BUTTON} aria-pressed={pick === r.pick} disabled={r.none && pick !== r.pick} onClick={() => onPick(r.pick!)}>{body}</button>
            : <div key={r.label} className={cn(ROW, "border-transparent")}>{body}</div>;
        })}
      </div>
    </div>
  );
}
