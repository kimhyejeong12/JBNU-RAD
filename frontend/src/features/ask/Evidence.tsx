import { criteriaText, serverCriteriaText } from "./lib";
import { useClauses } from "@/app/data";
import type { AskItem, AskKind, LogFacts, ServerFacts } from "@/shared/api/types";
import { Icon } from "@/shared/ui/Icon";
import { Section } from "@/shared/ui/parts";

interface Props { m: AskItem; i: number; pressed: (n: number) => boolean; onToggle: (n: number) => void }

// 답 아래의 근거 — 정책 질의는 조항 칩, 로그 · 서버 질의는 서버가 조건으로 찾은 기록 한 칩.
export function Evidence({ kind, ...p }: Props & { kind: AskKind }) {
  if (kind === "logs") return <LogEvidence {...p} />;
  if (kind === "servers") return <ServerEvidence {...p} />;
  return <SourceEvidence {...p} />;
}

function SourceEvidence({ m, pressed, onToggle }: Props) {
  const clauses = useClauses();
  return (
    <Section icon="db" title="근거 조항">
      {m.sources?.length ? (
        <div className="chips">
          {m.sources.map((s, n) => (
            <button key={n} className="chip" aria-pressed={pressed(n)} aria-controls="panel" onClick={() => onToggle(n)}>
              <Icon name="file" className="sm" /><span>{clauses.label(s)}</span><span className="open">{pressed(n) ? "표시 중" : "조항 전문"}</span>
            </button>
          ))}
        </div>
      ) : <p className="note">모델이 근거 문서를 반환하지 않았습니다.</p>}
    </Section>
  );
}

function LogEvidence({ m, pressed, onToggle }: Props) {
  const f = m.facts as LogFacts | null | undefined;
  return (
    <Section icon="db" title="근거 로그">
      <p className="note">조건: {criteriaText(m.criteria)}</p>
      {f?.count ? (
        <div className="chips">
          <button className="chip" aria-pressed={pressed(0)} aria-controls="panel" onClick={() => onToggle(0)}>
            <Icon name="file" className="sm" /><span>해당 로그 {f.count}건</span><span className="open">{pressed(0) ? "표시 중" : "로그 보기"}</span>
          </button>
        </div>
      ) : <p className="note">조건에 맞는 로그가 없습니다.</p>}
    </Section>
  );
}

function ServerEvidence({ m, pressed, onToggle }: Props) {
  const nodes = (m.facts as ServerFacts | null | undefined)?.["노드 수"] ?? 0;
  return (
    <Section icon="db" title="근거 기록">
      <p className="note">조건: {serverCriteriaText(m.criteria)}</p>
      {nodes ? (
        <div className="chips">
          <button className="chip" aria-pressed={pressed(0)} aria-controls="panel" onClick={() => onToggle(0)}>
            <Icon name="server" className="sm" /><span>서버 {nodes}대 · 기록 {m.evidence?.length ?? 0}줄</span><span className="open">{pressed(0) ? "표시 중" : "기록 보기"}</span>
          </button>
        </div>
      ) : <p className="note">조건에 맞는 서버가 없습니다.</p>}
    </Section>
  );
}
