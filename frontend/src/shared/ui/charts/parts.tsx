import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { activateProps } from "@/shared/lib/hooks";
import { lrowTone, ltable, ltableWrap, ltd, lth, mark, markTone, type MarkKey } from "@/shared/ui/base/styles";

export function Legend({ items, round }: { items: [cls: MarkKey, label: string][]; round?: boolean }) {
  return (
    <div className="flex flex-wrap gap-[14px] px-[18px] pt-2 pb-1 text-[12px] text-ink-dim">
      {items.map(([k, label]) => (
        <span key={k}><i className={cn("mr-[5px] inline-block size-[10px] align-[-1px]", round ? "rounded-full" : "rounded-[2px]", markTone[k])} />{label}</span>
      ))}
    </div>
  );
}

// 비율 막대 — 조각 너비 = 값 / 전체.
export function Meter({ segs, total }: { segs: [cls: MarkKey, value: number][]; total: number }) {
  return (
    <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-[4px] bg-canvas">
      {segs.filter(([, v]) => v).map(([k, v]) => <span key={k} className={cn(mark, markTone[k])} style={{ width: `${total ? (v / total) * 100 : 0}%` }} />)}
    </div>
  );
}

// 차트마다 [표로 보기] — 색을 못 보는 사람 · 인쇄 · 정확한 값.
export function TableView({ children }: { children: ReactNode }) {
  // 안의 표는 양옆 여백을 지우고 카드 끝까지 넓힙니다.
  return (
    <details className="px-[18px] pt-1 pb-3 [&>div]:mt-[6px] [&>div]:-mx-[18px]">
      <summary className="cursor-pointer px-0 py-1 text-[12px] text-ink-dim">표로 보기</summary>
      {children}
    </details>
  );
}

export interface DataRow {
  key: string;
  cells: ReactNode[];
  current?: boolean;
  onSelect?: () => void;
}

// 통계 표 — 고를 수 있는 줄은 키보드로도 고릅니다. numCols 는 오른쪽 정렬(숫자) 칸의 번호.
export function DataTable({ head, rows, empty, numCols = [] }: { head: string[]; rows: DataRow[]; empty: string; numCols?: number[] }) {
  // 통계 화면에서만 쓰여 빈 문구는 그 화면의 설명 줄과 같은 모양입니다.
  if (!rows.length) return <p className="m-0 px-[18px] pt-0 pb-[10px] text-[12.5px] text-ink-dim">{empty}</p>;
  return (
    <div className={ltableWrap}>
      <table className={ltable}>
        <thead><tr>{head.map((h) => <th key={h} className={lth}>{h}</th>)}</tr></thead>
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

// 꺾은선 하나 — 점은 호출한 쪽이 계산합니다.
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
