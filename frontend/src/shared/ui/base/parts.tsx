import type { ReactNode } from "react";
import type { Level } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { Icon } from "./Icon";
import { box, kvTable, kvTd, kvTh, levelDot } from "./styles";

// 등급 점 — 8px 점 + 같은 색 반투명 링. 등급이 없으면 회색.
export function LevelDot({ level, className }: { level?: Level | null; className?: string }) {
  return <i className={cn("mr-1.5 inline-block size-2 flex-none rounded-full align-[1px]", levelDot[level ?? "none"], className)} />;
}

// 패널 안의 작은 구역 — 아이콘 + 제목 + 내용.
export function Section({ icon, title, className, children }: { icon: string; title: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("mt-[18px]", className)}>
      <h4 className="m-0 mb-[7px] flex items-center gap-1.5 text-[12.5px] font-bold"><Icon name={icon} small />{title}</h4>
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

// 기간 버튼 묶음 — 지금부터 거슬러 올라가는 기간을 고릅니다.
export function Periods<K extends string>({ id, labels, value, onChange }: { id: string; labels: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-lg bg-canvas p-[3px]" id={id} role="group" aria-label="기간">
      {labels.map(([k, label]) => (
        <button key={k} aria-pressed={k === value} onClick={() => onChange(k)}
          className="rounded-md border-none bg-transparent px-[11px] py-[5px] text-[12.5px] font-semibold text-ink-dim aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,.08)]">
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

// 결재 · 결정 기록 — 인라인 요소 사이의 공백을 지킵니다 (옛 화면의 줄바꿈이 공백으로 보였습니다).
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
