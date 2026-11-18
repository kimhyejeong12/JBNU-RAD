import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { slotAt } from "@/shared/lib/format";
import { activateProps } from "@/shared/lib/hooks";
import { lrowTone, ltable, ltableWrap, ltd, lth, markTone, type MarkKey, cardNote } from "@/shared/ui/styles";

export function Legend({ items, round, className }: { items: [cls: MarkKey, label: string][]; round?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-3.5 px-4.5 pt-2 pb-1 text-[12px] text-ink-dim", className)}>
      {items.map(([k, label]) => (
        <span key={k}><i className={cn("mr-1.25 inline-block size-2.5 align-[-1px]", round ? "rounded-full" : "rounded-xs", markTone[k])} />{label}</span>
      ))}
    </div>
  );
}

export interface DataRow {
  key: string;
  cells: ReactNode[];
  current?: boolean;
  onSelect?: () => void;
}

// numCols 는 오른쪽 정렬(숫자) 칸의 번호임
export function DataTable({ head, rows, empty, numCols = [], scroll }: { head: string[]; rows: DataRow[]; empty: string; numCols?: number[]; scroll?: boolean }) {
  if (!rows.length) return <p className={cardNote}>{empty}</p>;
  return (
    <div className={cn(ltableWrap, scroll && "max-h-80 overflow-y-auto")}>
      <table className={ltable}>
        <thead><tr>{head.map((h) => <th key={h} className={cn(lth, scroll && "sticky top-0 bg-surface shadow-[inset_0_-1px_0_var(--color-line)]")}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={lrowTone(!!(r.onSelect && r.current))}
              aria-current={r.onSelect ? !!r.current : undefined} {...(r.onSelect ? activateProps(r.onSelect) : {})}>
              {r.cells.map((c, i) => <td key={i} className={cn(ltd, numCols.includes(i) && "tabular-nums")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 점수(0~100) 흐름 선 — 위아래 2px 여백
export function Sparkline({ scores, height, stroke, className, ariaLabel }: { scores: number[]; height: number; stroke: string; className?: string; ariaLabel?: string }) {
  return (
    <svg className={cn("inline align-baseline", className)} viewBox={`0 0 ${(scores.length - 1) * 10} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}
      aria-hidden={ariaLabel ? undefined : true} aria-label={ariaLabel}>
      <polyline fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        points={scores.map((s, n) => `${n * 10},${height - 2 - (s / 100) * (height - 4)}`).join(" ")} />
    </svg>
  );
}

// 세로축 눈금선 — [글, 높이 비율]
export function YGrid({ lines }: { lines: [label: number, at: number][] }) {
  return (
    <>
      {lines.map(([v, f], i) => (
        <span key={i} className="absolute -left-7.5 right-0 border-t border-line text-[10.5px] text-ink-dim tabular-nums" style={{ bottom: `${f * 100}%` }}>
          <span className="absolute -top-1.75 left-0 w-6.5 bg-surface text-right">{v}</span>
        </span>
      ))}
    </>
  );
}

const TICK = "absolute top-1 -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full";

// 가로축 날짜 — 처음 · 가운데 · 끝
export function XTicks({ count, label }: { count: number; label: (n: number) => string }) {
  const ticks = [...new Set([0, Math.floor(count / 2), count - 1])].filter((n) => n >= 0);
  return (
    <div className="relative ml-7.5 h-4.5 text-[11px] text-ink-dim tabular-nums">
      {/* 하루뿐이면 막대 아래 가운데에 — 양끝 정렬이면 왼쪽 밖으로 잘림 */}
      {ticks.length === 1 ? <span className={cn(TICK, "first:-translate-x-1/2 last:-translate-x-1/2")} style={{ left: `${slotAt(0, 1)}%` }}>{label(0)}</span>
        : ticks.map((n, i) => <span key={n} className={TICK} style={{ left: i === 0 ? "0" : i === ticks.length - 1 ? "100%" : `${slotAt(n, count)}%` }}>{label(n)}</span>)}
    </div>
  );
}
