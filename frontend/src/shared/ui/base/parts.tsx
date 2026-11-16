import type { CSSProperties, ReactNode } from "react";
import type { Level } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { Icon } from "./Icon";
import { box, kvTable, kvTd, kvTh, levelDot, levelText } from "./styles";

export function LevelDot({ level, className }: { level?: Level | null; className?: string }) {
  return <i className={cn("mr-1.5 inline-block size-2 flex-none rounded-full align-[1px]", levelDot[level ?? "none"], className)} />;
}

// 점과 등급 글자를 한 줄로 — 표의 AI 판단 칸에 씁니다.
export function LevelLabel({ level }: { level: Level }) {
  return <span className={cn("whitespace-nowrap font-semibold", levelText[level])}><LevelDot level={level} />{level}</span>;
}

// 알약 모양 배지 — 색은 tone 으로 줍니다.
export function Pill({ tone = "border-line text-ink-soft", className, children }: { tone?: string; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full border border-solid px-2 py-0.25 text-[12px] font-bold whitespace-nowrap", tone, className)}>{children}</span>;
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

// 아래 작은 글이 있는 타일과 없는 타일이 한 줄에 서도 이름 · 숫자 높이가 맞게 위에서부터 쌓습니다.
const TILE = "flex min-w-0 flex-col justify-start rounded-xl border border-line p-4 text-left";

// 고른 타일의 테두리 · 바탕 색 (CSS 색 값) — 안 주면 검정 테두리입니다.
export interface TileAccent { line: string; tint: string }

// 큰 숫자 하나 — children 은 아래 작은 글, extra 는 숫자와 글 사이(막대 등)입니다.
// onClick 을 주면 누르는 타일이고, pressed 는 목록을 이 타일로 거르는 중인지, dot 은 이름 앞 점의 색입니다.
export function Tile({ label, big, tone, extra, onClick, pressed, dot, accent, children }: {
  label: ReactNode; big: ReactNode; tone?: string; extra?: ReactNode; onClick?: () => void; pressed?: boolean;
  dot?: string; accent?: TileAccent; children?: ReactNode;
}) {
  const body = (
    <>
      <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink-dim">
        {dot && <i className="inline-block size-2 flex-none rounded-full" style={{ background: dot }} aria-hidden="true" />}{label}
      </span>
      <span className={cn("text-2xl leading-tight font-bold tabular-nums", tone)}>{big}</span>
      {extra}
      {children != null && <span className="mt-0.5 text-xs text-ink-dim">{children}</span>}
    </>
  );
  if (!onClick) return <div className={TILE}>{body}</div>;
  const vars = { "--tile-line": accent?.line ?? "var(--color-ink)", "--tile-tint": accent?.tint ?? "var(--color-surface)" } as CSSProperties;
  return (
    <button type="button" style={vars} aria-pressed={pressed} onClick={onClick}
      className={cn(TILE, "bg-surface hover:bg-row-hover aria-pressed:border-(--tile-line) aria-pressed:bg-(--tile-tint) aria-pressed:shadow-[inset_0_0_0_1px_var(--tile-line)]")}>
      {body}
    </button>
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
          <b className="font-bold">{s.title}</b>{" "}{s.who}{" "}
          <span className="text-[11.5px] text-ink-dim">{s.when}</span>
          {s.say ? <>{" "}<span className="mt-0.5 block text-ink-soft">{s.say}</span></> : null}
        </div>
      ))}
    </div>
  );
}

// 구분 기호 없이 간격으로 나눈 한 줄 정보입니다.
export function Meta({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2.5 gap-y-0.5", className)}>
      {items.filter((x) => x !== "" && x != null && x !== false).map((x, i) => <span key={i}>{x}</span>)}
    </span>
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
