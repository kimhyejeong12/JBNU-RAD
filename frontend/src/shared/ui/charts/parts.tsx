import type { CSSProperties, ReactNode } from "react";
import { activateProps } from "@/shared/lib/hooks";

export function Legend({ items, round }: { items: [cls: string, label: string][]; round?: boolean }) {
  return (
    <div className="legend">
      {items.map(([k, label]) => <span key={k}><i className={`mk ${k}${round ? " round" : ""}`} />{label}</span>)}
    </div>
  );
}

// 비율 막대 — 조각 너비 = 값 / 전체.
export function Meter({ segs, total }: { segs: [cls: string, value: number][]; total: number }) {
  return (
    <div className="meter">
      {segs.filter(([, v]) => v).map(([k, v]) => <span key={k} className={`mk ${k}`} style={{ width: `${total ? (v / total) * 100 : 0}%` }} />)}
    </div>
  );
}

// 차트마다 [표로 보기] — 색을 못 보는 사람 · 인쇄 · 정확한 값.
export function TableView({ children }: { children: ReactNode }) {
  return <details className="tableview"><summary>표로 보기</summary>{children}</details>;
}

export interface DataRow {
  key: string;
  cells: ReactNode[];
  current?: boolean;
  onSelect?: () => void;
}

// 통계 표 — 고를 수 있는 줄은 키보드로도 고릅니다. numCols 는 오른쪽 정렬(숫자) 칸의 번호.
export function DataTable({ head, rows, empty, numCols = [] }: { head: string[]; rows: DataRow[]; empty: string; numCols?: number[] }) {
  if (!rows.length) return <p className="sub">{empty}</p>;
  return (
    <div className="ltable-wrap">
      <table className="ltable">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} aria-current={r.onSelect ? !!r.current : undefined} {...(r.onSelect ? activateProps(r.onSelect) : {})}>
              {r.cells.map((c, i) => <td key={i} className={numCols.includes(i) ? "num" : undefined}>{c}</td>)}
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
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={style} aria-hidden={ariaLabel ? undefined : true} aria-label={ariaLabel}>
      <polyline fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap={round ? "round" : undefined} vectorEffect="non-scaling-stroke"
        points={points.map(([x, y]) => `${x},${y}`).join(" ")} />
    </svg>
  );
}
