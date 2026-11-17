import type { ReactNode } from "react";
import type { Level } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { dayTime, pageLinks } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { Icon } from "./Icon";
import { box, kvTable, kvTd, kvTh, levelDot, levelText } from "./styles";

export function LevelDot({ level, className }: { level?: Level | null; className?: string }) {
  return <i className={cn("mr-1.5 inline-block size-2 flex-none rounded-full align-[1px]", levelDot[level ?? "none"], className)} />;
}

// 등급 기호와 글자를 한 줄로 — 표의 AI 판단 칸에 씁니다 (검토 현황 · 종합 대시보드).
export function LevelLabel({ level }: { level: Level }) {
  return <span className={cn("flex items-center gap-1.25 whitespace-nowrap font-semibold", levelText[level])}><Icon name={LEVEL_ICON[level]} small />{level}</span>;
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

// 날짜(진하게) 위, 시각(연하게) 아래 — 표 · 목록의 시각 칸에 씁니다.
export function DayTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const [day, time] = dayTime(iso);
  return (
    <span className={cn("flex flex-col whitespace-nowrap leading-tight tabular-nums", className)}>
      <b className="text-[13px] font-semibold">{day}</b><small className="text-[11.5px] text-ink-dim">{time}</small>
    </span>
  );
}

const PAGER = "flex size-8 items-center justify-center rounded border border-line bg-surface text-sm font-medium text-ink-soft hover:bg-row-hover disabled:cursor-default disabled:opacity-50 aria-[current=true]:border-brand aria-[current=true]:bg-brand aria-[current=true]:text-white";

// 쪽 번호 줄 — 표를 쪽으로 나눠 스크롤을 줄입니다 (내 신청 · 종합 대시보드 표).
export function Pager({ at, pages, onPage, className }: { at: number; pages: number; onPage: (n: number) => void; className?: string }) {
  return (
    <nav className={cn("flex items-center justify-center gap-2", className)} aria-label="쪽">
      <button type="button" className={PAGER} disabled={at === 1} onClick={() => onPage(at - 1)} aria-label="앞 쪽"><Icon name="back" small /></button>
      {pageLinks(at, pages).map((n) => <button type="button" key={n} className={PAGER} aria-current={n === at} onClick={() => onPage(n)}>{n}</button>)}
      <button type="button" className={PAGER} disabled={at === pages} onClick={() => onPage(at + 1)} aria-label="다음 쪽"><Icon name="chev" small /></button>
    </nav>
  );
}

// 기호와 글을 묶은 회색 배지 — 표의 분류 칸 (보안 현황 유형, 계정 역할, 권한의 업무 시스템).
export function IconBadge({ icon, children }: { icon: string; children: ReactNode }) {
  return <Pill tone="border-transparent bg-canvas text-ink-soft" className="max-w-full gap-1 rounded-md py-0.75"><Icon name={icon} small /><span className="truncate">{children}</span></Pill>;
}

// 패널 안의 묶음 상자 — 무엇에 쓰는 칸인지 제목으로 나눕니다 (관리 패널의 업무 정보 · 시스템 역할 · 검색 상태).
export function GroupBox({ icon, title, className, children }: { icon: string; title: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("mt-4 rounded-xl border border-line bg-canvas px-3.5 pt-3 pb-3.5", className)}>
      <h4 className="m-0 mb-2.5 flex items-center gap-1.5 text-[13px] font-bold"><Icon name={icon} small />{title}</h4>
      {children}
    </section>
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

// 큰 숫자 하나 — children 은 아래 작은 글, extra 는 숫자와 글 사이(막대 등)입니다.
// onClick 을 주면 누르는 타일이고, pressed 는 목록을 이 타일로 거르는 중인지, dot 은 이름 앞 점의 색입니다.
export function Tile({ label, big, tone, extra, onClick, pressed, dot, className, children }: {
  label: ReactNode; big: ReactNode; tone?: string; extra?: ReactNode; onClick?: () => void; pressed?: boolean;
  dot?: string; className?: string; children?: ReactNode;
}) {
  const body = (
    <>
      <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink-dim">
        {dot && <i className="inline-block size-2 flex-none rounded-full" style={{ background: dot }} aria-hidden="true" />}{label}
      </span>
      <span className={cn("text-2xl font-bold tabular-nums", tone)}>{big}</span>
      {extra}
      {children != null && <span className="mt-0.5 text-xs text-ink-dim">{children}</span>}
    </>
  );
  if (!onClick) return <div className={cn(TILE, className)}>{body}</div>;
  // 고른 타일은 2px 남색 테두리만 — 신청서 칸을 누를 때와 같은 표시입니다.
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className={cn(TILE, className, "bg-surface hover:bg-row-hover aria-pressed:border-brand aria-pressed:shadow-[inset_0_0_0_1px_var(--color-brand)]")}>
      {body}
    </button>
  );
}

// 바꿔 보기 버튼 줄 — 기간 고르기, 패널 안 탭(검토 패널)이 함께 씁니다. fill 이면 칸을 같은 폭으로 채웁니다.
export function Periods<K extends string>({ id, labels, value, onChange, label = "기간", fill, className }: {
  id: string; labels: [K, ReactNode][]; value: K; onChange: (k: K) => void; label?: string; fill?: boolean; className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-0.5 rounded-lg bg-canvas p-0.75", fill && "grid", className)} id={id} role="group" aria-label={label}
      style={fill ? { gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` } : undefined}>
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
// labelFirst 면 글이 왼쪽, 스위치가 오른쪽 끝입니다 (패널 머리의 활성 스위치).
export function Switch({ checked, disabled, label, hint, labelFirst, onChange, className }: {
  checked: boolean; disabled?: boolean; label: string; hint?: string; labelFirst?: boolean; onChange: (next: boolean) => void; className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-2.5 text-[13px]", labelFirst && "flex-row-reverse", disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <input className="peer sr-only" type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true"
        className="relative mt-px h-5 w-9 shrink-0 rounded-full bg-line transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-surface after:shadow-[0_1px_2px_rgba(0,0,0,.2)] after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-40" />
      <span className="flex flex-col gap-0.5 text-ink peer-disabled:text-ink-dim">
        <span className="font-semibold">{label}</span>
        {hint && <span className="text-[12px] text-ink-dim">{hint}</span>}
      </span>
    </label>
  );
}
