import type { ReactNode } from "react";
import type { Level } from "@/shared/api/types";
import { Icon } from "./Icon";

// 등급 점 — 8px 점 + 같은 색 반투명 링. 등급이 없으면 회색.
export function LevelDot({ level }: { level?: Level | null }) {
  return <i className={`ldot ${level ?? "none"}`} />;
}

// 패널 안의 작은 구역 — 아이콘 + 제목 + 내용.
export function Section({ icon, title, children }: { icon: string; title: ReactNode; children: ReactNode }) {
  return (
    <div className="sec">
      <h4><Icon name={icon} className="sm" />{title}</h4>
      {children}
    </div>
  );
}

export function KvTable({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <div className="box">
      <table className="kv">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

// 기간 버튼 묶음 — 지금부터 거슬러 올라가는 기간을 고릅니다.
export function Periods<K extends string>({ id, labels, value, onChange }: { id: string; labels: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="periods" id={id} role="group" aria-label="기간">
      {labels.map(([k, label]) => (
        <button key={k} aria-pressed={k === value} onClick={() => onChange(k)}>{label}</button>
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
    <div className="box history">
      {steps.map((s, i) => (
        <div className="step" key={i}>
          <b>{s.title}</b>{" · "}{s.who}{" "}
          <span className="when">{s.when}</span>
          {s.say ? <>{" "}<span className="say">{s.say}</span></> : null}
        </div>
      ))}
    </div>
  );
}
