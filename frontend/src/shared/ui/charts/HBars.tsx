import { cn } from "@/shared/lib/cn";
import { mark, markTone, type MarkKey } from "@/shared/ui/base/styles";

export interface HBarRow {
  key: string;
  label: string;
  segs: [cls: MarkKey, value: number][];
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
    <div className="grid grid-cols-[minmax(90px,max-content)_1fr_max-content] items-center gap-x-2.5 gap-y-1.5 phone:grid-cols-[minmax(70px,34%)_1fr] phone:gap-y-0.5">
      {rows.map((r) => {
        const total = sum(r.segs);
        const base = r.base || top;
        const tip = `${r.label}|${r.segs.filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(" · ") || "없음"}${r.extra ? ` · ${r.extra}` : ""}`;
        return (
          // 줄 요소는 display: contents 라 고른 · hover 상태는 group 으로 자식에게 넘깁니다 (이름은 굵게, 고른 막대는 테두리).
          <div className="group contents cursor-pointer" key={r.key} aria-current={selectedKey === r.key} onClick={() => onSelect(r.key)}>
            <span className="max-w-55 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] group-hover:font-bold group-focus-within:font-bold group-aria-current:font-bold">{r.label}</span>
            <span className="flex min-w-0 items-center" tabIndex={0} data-tip={tip}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.key); } }}>
              <span className="flex h-3.5 min-w-0 gap-0.5 group-aria-current:rounded-sm group-aria-current:outline-2 group-aria-current:outline-offset-2 group-aria-current:outline-ink"
                style={{ width: `${base ? (total / base) * 100 : 0}%` }}>
                {r.segs.filter(([, v]) => v).map(([k, v]) => <span key={k} className={cn(mark, "h-full last:rounded-r-sm", markTone[k])} style={{ flex: `${v} 1 0` }} />)}
              </span>
            </span>
            <span className="whitespace-nowrap text-[12px] text-ink-dim tabular-nums phone:col-start-2 phone:mb-1.5">{value ? value(r) : String(total)}</span>
          </div>
        );
      })}
    </div>
  );
}
