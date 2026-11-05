import type { ReactNode } from "react";
import { criteriaText, serverCriteriaText } from "./lib";
import { useClauses } from "@/app/session/data";
import type { AskItem, AskKind, LogFacts, ServerFacts } from "@/shared/api/types";
import { Icon } from "@/shared/ui/base/Icon";
import { Section } from "@/shared/ui/base/parts";
import { cn } from "@/shared/lib/cn";
import { chip, chipTone, chips, note } from "@/shared/ui/base/styles";

interface Props { m: AskItem; i: number; pressed: (n: number) => boolean; onToggle: (n: number) => void }

const ROW = cn(chips, "flex-row flex-wrap");

function Chip({ icon, on, open, onClick, children }: { icon: string; on: boolean; open: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className={cn(chip, chipTone(on), "w-auto")} aria-pressed={on} aria-controls="panel" onClick={onClick}>
      <Icon name={icon} small /><span>{children}</span><span className="ml-auto whitespace-nowrap text-[11px] text-ink-dim">{on ? "표시 중" : open}</span>
    </button>
  );
}

export function Evidence({ kind, ...p }: Props & { kind: AskKind }) {
  if (kind === "logs") return <LogEvidence {...p} />;
  if (kind === "servers") return <ServerEvidence {...p} />;
  return <SourceEvidence {...p} />;
}

function SourceEvidence({ m, pressed, onToggle }: Props) {
  const clauses = useClauses();
  return (
    <Section className="mt-0.5" icon="db" title="근거 조항">
      {m.sources?.length ? (
        <div className={ROW}>
          {m.sources.map((s, n) => <Chip key={n} icon="file" on={pressed(n)} open="조항 전문" onClick={() => onToggle(n)}>{clauses.label(s)}</Chip>)}
        </div>
      ) : <p className={note}>모델이 근거 문서를 반환하지 않았습니다.</p>}
    </Section>
  );
}

function LogEvidence({ m, pressed, onToggle }: Props) {
  const f = m.facts as LogFacts | null | undefined;
  return (
    <Section className="mt-0.5" icon="db" title="근거 로그">
      <p className={note}>조건: {criteriaText(m.criteria)}</p>
      {f?.count ? (
        <div className={ROW}>
          <Chip icon="file" on={pressed(0)} open="로그 보기" onClick={() => onToggle(0)}>해당 로그 {f.count}건</Chip>
        </div>
      ) : <p className={note}>조건에 맞는 로그가 없습니다.</p>}
    </Section>
  );
}

function ServerEvidence({ m, pressed, onToggle }: Props) {
  const nodes = (m.facts as ServerFacts | null | undefined)?.["노드 수"] ?? 0;
  return (
    <Section className="mt-0.5" icon="db" title="근거 기록">
      <p className={note}>조건: {serverCriteriaText(m.criteria)}</p>
      {nodes ? (
        <div className={ROW}>
          <Chip icon="server" on={pressed(0)} open="기록 보기" onClick={() => onToggle(0)}>서버 {nodes}대 · 기록 {m.evidence?.length ?? 0}줄</Chip>
        </div>
      ) : <p className={note}>조건에 맞는 서버가 없습니다.</p>}
    </Section>
  );
}
