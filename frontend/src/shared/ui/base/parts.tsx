import type { ReactNode } from "react";
import type { Level } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { Icon } from "./Icon";
import { box, kvTable, kvTd, kvTh, levelDot } from "./styles";

export function LevelDot({ level, className }: { level?: Level | null; className?: string }) {
  return <i className={cn("mr-1.5 inline-block size-2 flex-none rounded-full align-[1px]", levelDot[level ?? "none"], className)} />;
}

export function Section({ icon, title, className, children }: { icon: string; title: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("mt-4.5", className)}>
      <h4 className="m-0 mb-1.75 flex items-center gap-1.5 text-[12.5px] font-bold"><Icon name={icon} small />{title}</h4>
      {children}
    </div>
  );
}

export function KvTable({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <div className={box}>
      <table className={kvTable}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th className={kvTh}>{k}</th>
              <td className={kvTd}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Periods<K extends string>({ id, labels, value, onChange, label = "기간" }: { id: string; labels: [K, ReactNode][]; value: K; onChange: (k: K) => void; label?: string }) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-lg bg-canvas p-0.75" id={id} role="group" aria-label={label}>
      {labels.map(([k, label]) => (
        <button key={k} aria-pressed={k === value} onClick={() => onChange(k)}
          className="rounded-md border-none bg-transparent px-2.75 py-1.25 text-[12.5px] font-semibold text-ink-dim aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,.08)]">
          {label}
        </button>
      ))}
    </div>
  );
}

export interface HistoryStep {
  title: string;
  who: string;
  when: string;
  say?: string | null;
}

// 줄바꿈이 공백으로 보이던 모양대로 인라인 요소 사이 공백을 지킵니다.
export function History({ steps }: { steps: HistoryStep[] }) {
  return (
    <div className={cn(box, "flex flex-col gap-2")}>
      {steps.map((s, i) => (
        <div className="text-[12.5px]" key={i}>
          <b className="font-bold">{s.title}</b>{" · "}{s.who}{" "}
          <span className="text-[11.5px] text-ink-dim">{s.when}</span>
          {s.say ? <>{" "}<span className="mt-0.5 block text-ink-soft">{s.say}</span></> : null}
        </div>
      ))}
    </div>
  );
}

// 보이는 값은 서버 값이라 확인 창에서 취소하면 그대로 남습니다.
export function Switch({ checked, disabled, label, hint, onChange, className }: {
  checked: boolean; disabled?: boolean; label: string; hint: string; onChange: (next: boolean) => void; className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-2.5 text-[13px]", disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <input className="peer sr-only" type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true"
        className="relative mt-px h-5 w-9 shrink-0 rounded-full bg-line transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-surface after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-40" />
      <span className="flex flex-col gap-0.5 text-ink peer-disabled:text-ink-dim">
        <span className="font-semibold">{label}</span>
        <span className="text-[12px] text-ink-dim">{hint}</span>
      </span>
    </label>
  );
}
