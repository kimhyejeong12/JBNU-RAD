export interface HBarRow {
  key: string;
  label: string;
  segs: [cls: string, value: number][];
  extra?: string;
  base?: number;   // 비율이면 그 줄의 합
}

const sum = (segs: HBarRow["segs"]) => segs.reduce((a, [, v]) => a + v, 0);

// 가로 막대 — 줄마다 고르면 패널이 열립니다. max 는 막대 길이의 기준. 숫자는 막대 옆 글자로 줘서 색만으로 읽지 않게 합니다.
export function HBars({ rows, max, value, selectedKey, onSelect }: {
  rows: HBarRow[]; max?: number; value?: (r: HBarRow) => string; selectedKey?: string | null; onSelect: (key: string) => void;
}) {
  const top = max || Math.max(1, ...rows.map((r) => sum(r.segs)));
  return (
    <div className="hbars">
      {rows.map((r) => {
        const total = sum(r.segs);
        const base = r.base || top;
        const tip = `${r.label}|${r.segs.filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(" · ") || "없음"}${r.extra ? ` · ${r.extra}` : ""}`;
        return (
          <div className="hbar" key={r.key} aria-current={selectedKey === r.key} onClick={() => onSelect(r.key)}>
            <span className="lbl">{r.label}</span>
            <span className="track" tabIndex={0} data-tip={tip}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.key); } }}>
              <span className="bar" style={{ width: `${base ? (total / base) * 100 : 0}%` }}>
                {r.segs.filter(([, v]) => v).map(([k, v]) => <span key={k} className={`mk ${k}`} style={{ flex: `${v} 1 0` }} />)}
              </span>
            </span>
            <span className="val">{value ? value(r) : String(total)}</span>
          </div>
        );
      })}
    </div>
  );
}
