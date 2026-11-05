import { criteriaText, stepText, toolLabel } from "./lib";
import { useConversation } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { PanelHead } from "@/app/ui/panel/Panel";
import type { AskItem, AskStep, LogFacts, ServerFacts } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { KvTable, Section } from "@/shared/ui/base/parts";
import { boxPre, clause, meta, note, panelBody, subject } from "@/shared/ui/base/styles";

// 답 아래 근거 칩 하나 = 도구 호출 한 번. 도구마다 보여 주는 모양이 다릅니다.
export function AskPanel() {
  const { ui } = useUi();
  const list = useConversation(ui.conversation);
  const sel = ui.askSource;
  const m = sel ? list[sel.i] : undefined;
  const s = sel ? m?.steps?.[sel.n] : undefined;
  if (!m || !s || !sel) return <><PanelHead title="근거" /><div className={panelBody}><p className={note}>답 아래 근거 칩을 누르면 여기에 나옵니다.</p></div></>;
  const head = { m, i: sel.i, s };
  return (
    <>
      <PanelHead title={`근거 — ${toolLabel(s)}`} />
      <div className={panelBody}>
        <p className={subject}>{stepText(s)}</p>
        <div className={meta}>Q{sel.i + 1} · {m.q}</div>
        {s.error ? <Section icon="warn" title="도구 오류"><div className={boxPre}>{s.error}</div></Section>
          : s.tool === "find_logs" && s.facts ? <Logs {...head} f={s.facts as LogFacts} />
            : s.tool === "servers" && s.facts ? <Servers {...head} f={s.facts as ServerFacts} />
              : s.tool === "search_regulations" ? <Clauses s={s} />
                : <Lines s={s} />}
      </div>
    </>
  );
}

interface Props { m: AskItem; i: number; s: AskStep }

function Logs({ s, f }: Props & { f: LogFacts }) {
  const evidence = s.evidence ?? [];
  const rows: [string, string][] = [
    ["조건", criteriaText(s.criteria, "조건 없음 (전체 로그)")],
    ["해당 로그", `${f.count}건`],
    ["기간", f.count ? `${stamp(f.first)} ~ ${stamp(f.last)}` : "—"],
    ...Object.entries(f.by_user).map(([u, n]) => [u, `${n}건`] as [string, string]),
    ...Object.entries(f.attribute_totals).map(([k, v]) => [`${k} 합계`, String(v)] as [string, string]),
  ];
  return (
    <>
      <Section icon="activity" title="집계"><KvTable rows={rows} /></Section>
      <Section icon="file" title="로그">
        {evidence.length ? <div className={boxPre}>{evidence.join("\n")}</div> : <p className={note}>조건에 맞는 로그가 없습니다.</p>}
        {f.count > evidence.length && <p className={note}>최근 {evidence.length}건만 표시 (집계는 전체 {f.count}건)</p>}
      </Section>
    </>
  );
}

function Servers({ s, f }: Props & { f: ServerFacts }) {
  const evidence = s.evidence ?? [];
  const levels = Object.entries(f["마지막 판정 등급별 노드 수"] || {}).map(([k, n]) => `${k} ${n}`).join(" · ") || "—";
  const nodes = Object.entries(f["노드별"] || {}).map(([node, r]) => {
    const judged = Object.entries(r["판정"]).map(([k, n]) => `${k} ${n}`).join(" · ") || "판정 없음";
    return [node, `수집 ${r["수집"]} · 바뀐 설정 ${r["바뀐 설정"]} · 서버 점검 ${judged}`] as [string, string];
  });
  const first = f["기간 안 첫 수집"];
  return (
    <>
      <Section icon="activity" title="집계">
        <KvTable rows={[["조건", criteriaText(s.criteria, "조건 없음 (모든 서버 · 지금 상태)")], ["서버", `${f["노드 수"]}대`], ["마지막 판정", levels],
          ["기간 안 수집", first ? `${stamp(first)} ~ ${stamp(f["기간 안 마지막 수집"])}` : "없음"], ...nodes]} />
      </Section>
      <Section icon="file" title="상태 · 바뀐 설정 · 서버 점검 기록">
        {evidence.length ? <div className={boxPre}>{evidence.join("\n")}</div> : <p className={note}>기록이 없습니다.</p>}
      </Section>
    </>
  );
}

function Clauses({ s }: { s: AskStep }) {
  const evidence = s.evidence ?? [];
  return (
    <Section icon="book" title={`기준 문서 조각${s.sources?.length ? ` — ${s.sources.join(" · ")}` : ""}`}>
      {evidence.length ? evidence.map((t, n) => <div key={n} className={clause}>{t}</div>) : <p className={note}>찾은 조항이 없습니다.</p>}
    </Section>
  );
}

function Lines({ s }: { s: AskStep }) {
  const evidence = s.evidence ?? [];
  return (
    <Section icon="file" title="찾은 것">
      {evidence.length ? <div className={boxPre}>{evidence.join("\n")}</div> : <p className={note}>{s.summary}</p>}
      {!!s.sources?.length && <p className={note}>근거: {s.sources.join(" · ")}</p>}
    </Section>
  );
}
