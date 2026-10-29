import { askMode, criteriaText, serverCriteriaText } from "./lib";
import { useClauses, useQa } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { PanelHead } from "@/app/ui/panel/Panel";
import type { AskItem, LogFacts, ServerFacts } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { KvTable, Section } from "@/shared/ui/base/parts";

// 질의 탭의 패널 — 근거 칩을 눌렀을 때만 보입니다 (인용 조항 원문 · 근거 로그 · 근거 기록).
export function AskPanel() {
  const { ui } = useUi();
  const mode = askMode(ui.view);
  const list = useQa(mode);
  const sel = ui.askSource;
  const m = sel ? list[sel.i] : undefined;
  if (m && sel && mode === "logs") return <LogAskPanel m={m} i={sel.i} />;
  if (m && sel && mode === "servers") return <ServerAskPanel m={m} i={sel.i} />;
  return <SourcePanel m={m} i={sel?.i ?? 0} source={m?.sources?.[sel?.n ?? 0]} />;
}

function SourcePanel({ m, i, source }: { m?: AskItem; i: number; source?: string }) {
  const clauses = useClauses();
  return (
    <>
      <PanelHead title="인용 조항 원문" />
      <div className="panel-body">
        {m && source && (
          <>
            <p className="subject">{clauses.label(source)}</p>
            <div className="meta">Q{i + 1} · {m.q}</div>
            <Section icon="book" title="기준 문서 원문"><div className="clause">{clauses.text(source)}</div></Section>
          </>
        )}
      </div>
    </>
  );
}

function LogAskPanel({ m, i }: { m: AskItem; i: number }) {
  const f = m.facts as LogFacts;
  const evidence = m.evidence ?? [];
  const rows: [string, string][] = [
    ["해당 로그", `${f.count}건`],
    ["기간", `${stamp(f.first)} ~ ${stamp(f.last)}`],
    ...Object.entries(f.by_user).map(([u, n]) => [u, `${n}건`] as [string, string]),
    ...Object.entries(f.attribute_totals).map(([k, v]) => [`${k} 합계`, String(v)] as [string, string]),
  ];
  return (
    <>
      <PanelHead title="근거 로그" />
      <div className="panel-body">
        <p className="subject">{criteriaText(m.criteria)}</p>
        <div className="meta">Q{i + 1} · {m.q}</div>
        <Section icon="activity" title="집계"><KvTable rows={rows} /></Section>
        <Section icon="file" title="로그">
          <div className="box pre">{evidence.join("\n")}</div>
          {f.count > evidence.length && <p className="note">최근 {evidence.length}건만 표시 (집계는 전체 {f.count}건)</p>}
        </Section>
      </div>
    </>
  );
}

function ServerAskPanel({ m, i }: { m: AskItem; i: number }) {
  const f = m.facts as ServerFacts;
  const evidence = m.evidence ?? [];
  const levels = Object.entries(f["마지막 판정 등급별 노드 수"] || {}).map(([k, n]) => `${k} ${n}`).join(" · ") || "—";
  const nodes = Object.entries(f["노드별"] || {}).map(([node, r]) => {
    const judged = Object.entries(r["판정"]).map(([k, n]) => `${k} ${n}`).join(" · ") || "판정 없음";
    return [node, `수집 ${r["수집"]} · 바뀐 설정 ${r["바뀐 설정"]} · 서버 점검 ${judged}`] as [string, string];
  });
  const first = f["기간 안 첫 수집"];
  return (
    <>
      <PanelHead title="근거 기록" />
      <div className="panel-body">
        <p className="subject">{serverCriteriaText(m.criteria)}</p>
        <div className="meta">Q{i + 1} · {m.q}</div>
        <Section icon="activity" title="집계">
          <KvTable rows={[["서버", `${f["노드 수"]}대`], ["마지막 판정", levels], ["기간 안 수집", first ? `${stamp(first)} ~ ${stamp(f["기간 안 마지막 수집"])}` : "없음"], ...nodes]} />
        </Section>
        <Section icon="file" title="바뀐 설정 · 서버 점검 기록">
          {evidence.length ? <div className="box pre">{evidence.join("\n")}</div> : <p className="note">기간 안에 바뀐 설정 · 서버 점검이 없습니다.</p>}
        </Section>
      </div>
    </>
  );
}
