import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { activateProps } from "@/shared/lib/hooks";
import { Periods } from "@/shared/ui/base/parts";
import { lrowTone, ltable, ltableWrap, ltd, lth, mark, markTone, type MarkKey } from "@/shared/ui/base/styles";

export function Legend({ items, round }: { items: [cls: MarkKey, label: string][]; round?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3.5 px-4.5 pt-2 pb-1 text-[12px] text-ink-dim">
      {items.map(([k, label]) => (
        <span key={k}><i className={cn("mr-1.25 inline-block size-2.5 align-[-1px]", round ? "rounded-full" : "rounded-xs", markTone[k])} />{label}</span>
      ))}
    </div>
  );
}

export function Meter({ segs, total }: { segs: [cls: MarkKey, value: number][]; total: number }) {
  return (
    <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-sm bg-canvas">
      {segs.filter(([, v]) => v).map(([k, v]) => <span key={k} className={cn(mark, markTone[k])} style={{ width: `${total ? (v / total) * 100 : 0}%` }} />)}
    </div>
  );
}

// 표는 차트 자리에 바꿔 보여 카드가 길어지지 않게 합니다.
export function ViewSwitch({ id, table, onChange }: { id: string; table: boolean; onChange: (table: boolean) => void }) {
  return <Periods<"chart" | "table"> id={id} label="보기" labels={[["chart", "차트"], ["table", "표"]]} value={table ? "table" : "chart"} onChange={(k) => onChange(k === "table")} />;
}

export interface DataRow {
  key: string;
  cells: ReactNode[];
  current?: boolean;
  onSelect?: () => void;
}

// numCols 는 오른쪽 정렬(숫자) 칸의 번호입니다.
export function DataTable({ head, rows, empty, numCols = [], scroll }: { head: string[]; rows: DataRow[]; empty: string; numCols?: number[]; scroll?: boolean }) {
  if (!rows.length) return <p className="m-0 px-4.5 pt-0 pb-2.5 text-[12.5px] text-ink-dim">{empty}</p>;
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

export function Sparkline({ points, width, height, stroke, round, style, ariaLabel }: {
  points: [number, number][]; width: number; height: number; stroke: string; round?: boolean; style?: CSSProperties; ariaLabel?: string;
}) {
  return (
    <svg className="inline align-baseline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={style} aria-hidden={ariaLabel ? undefined : true} aria-label={ariaLabel}>
      <polyline fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap={round ? "round" : undefined} vectorEffect="non-scaling-stroke"
        points={points.map(([x, y]) => `${x},${y}`).join(" ")} />
    </svg>
  );
}
