import { useState } from "react";
import { DECISIONS, DECISION_SET } from "./constants";
import { useDecide, type ReviewItem } from "./api";
import { DecisionLog } from "./DecisionLog";
import { useResults } from "@/app/data";
import { useUi } from "@/app/ui/UiContext";
import { PanelHead } from "@/app/ui/PanelHead";
import { SourceChips } from "@/app/ui/SourceChips";
import type { EventFinding, PolicyIssue, PolicyRow, ServerFinding } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/levels";
import { Icon } from "@/shared/ui/Icon";
import { KvTable } from "@/shared/ui/KvTable";
import { LevelDot } from "@/shared/ui/LevelDot";
import { ModuleState } from "@/shared/ui/ModuleTables";
import { PanelMsg } from "@/shared/ui/PanelMsg";
import { Section } from "@/shared/ui/Section";

// 정책 문제 · 서버 점검 · 로그 감시 판정의 근거와 운영자 결정.
export function ReviewPanel({ it }: { it: ReviewItem }) {
  const { ui, openLogs } = useUi();
  const results = useResults();
  const decide = useDecide();
  const [comment, setComment] = useState("");
  const r = it.raw;
  const decision = it.decision;
  // 10/14부터 서버 점검은 다른 곳마다 지금 · 기준 · 바꿀 것을 따로 받습니다. 그 전 결과(recommendation 이 있음)는 예전 칸으로 보입니다.
  const gapped = it.type === "server" && !it.raw.failed && !it.raw.recommendation;
  const act = (action: string) => decide.mutate({ it, action, comment }, { onSuccess: () => setComment("") });

  return (
    <>
      <PanelHead title="AI 판단 근거" />
      <div className="panel-body">
        <p className="subject">{it.type === "policy" ? `${it.who} · ${it.raw.kind}` : it.raw.title}</p>
        <div className={`rec-line lv-${it.level}`}><Icon name={(it.level && LEVEL_ICON[it.level]) || "warn"} />{it.level}</div>
        <div className="meta">{it.id}</div>

        {it.type === "server" && <ServerSections f={it.raw} />}
        {it.type === "event" && <EventSection f={it.raw} onLogs={() => openLogs({ user: it.raw.title, period: "month" })} />}
        {it.type === "policy" && <PolicySection issue={it.raw} policies={results.policies} />}

        {gapped && it.type === "server" ? <GapSections itemKey={it.key} f={it.raw} /> : (
          <>
            <Section icon="activity" title="판단 이유"><div className="box">{r.reason}</div></Section>
            <Section icon="ok" title="권고 조치"><div className="box">{r.recommendation}</div></Section>
            <Section icon="db" title="근거 조항">
              {it.type !== "policy" ? <SourceChips itemKey={it.key} sources={r.sources} /> : <p className="note">근거는 판단 이유에 함께 적혀 있습니다.</p>}
            </Section>
          </>
        )}
        {results.decision_log && <DecisionLog log={results.decision_log} it={it} />}
      </div>

      {it.type === "event" && it.raw.stage === "fast" ? (
        <div className="panel-foot">
          <h4>1차 판정 — 확정 대기</h4>
          <p className="note">빠른 감시의 판정입니다. 정밀 감시가 확정하면 결정할 수 있습니다.</p>
        </div>
      ) : (
        <div className="panel-foot">
          <h4>의사결정</h4>
          <textarea id="review-comment" maxLength={2000} placeholder="결정 의견 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="decide">
            {Object.entries(DECISION_SET[it.type]).map(([a, cls]) => (
              <button key={a} className={cls} aria-pressed={decision?.action === a} onClick={() => act(a)}>{DECISIONS[a]}</button>
            ))}
          </div>
          <div className="decision-state">
            {decision ? (
              <>
                <span>
                  결정 <b>{DECISIONS[decision.action]}</b> · {`${decision.decider_department ?? ""} ${decision.decider_name}`.trim()} · {stamp(decision.decided_at)}
                  {decision.ai_level ? ` (그때 AI 판정: ${decision.ai_level})` : ""}{decision.comment ? ` — ${decision.comment}` : ""}
                </span>
                <button id="undo" onClick={() => act("cancel")}>취소</button>
              </>
            ) : <span>AI는 권고만 합니다. 최종 결정은 사람이 내립니다.</span>}
          </div>
          <PanelMsg msg={ui.panelMsg} />
        </div>
      )}
    </>
  );
}

function ServerSections({ f }: { f: ServerFinding }) {
  const state = Object.entries(f.detail?.state ?? {}).filter(([, v]) => v) as [string, string][];
  return (
    <>
      {state.length > 0 && <Section icon="server" title="서버 현황"><KvTable rows={state} /></Section>}
      <ModuleState snap={f.detail?.snapshot} />
      <Section icon="file" title="이 서버에 걸린 정책"><div className="box pre">{f.detail?.matched}</div></Section>
    </>
  );
}

function EventSection({ f, onLogs }: { f: EventFinding; onLogs: () => void }) {
  return (
    <Section icon="file" title="판정한 로그">
      <div className="box pre">{f.detail?.events || "로그 없음"}</div>
      <button className="rerun" id="to-logs" onClick={onLogs}><Icon name="search" className="sm" />이 사용자의 최근 한 달 로그</button>
    </Section>
  );
}

function PolicySection({ issue, policies }: { issue: PolicyIssue; policies: PolicyRow[] }) {
  const rows = policies.filter((p) => (issue.policy_ids || []).includes(p.policy_id));
  return (
    <Section icon="file" title="관련 정책 원본">
      <div className="box">
        <table className="kv">
          <tbody>
            {rows.length
              ? rows.map((p) => <tr key={p.policy_id}><th>{p.policy_id}</th><td>{`${p.solution} · ${p.source} → ${p.destination} · ${p.service} · ${p.action} · 만료 ${p.expires_at || "없음"}`}</td></tr>)
              : <tr><td>정보 없음</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// 서버 점검 — 기준 문서와 다른 곳마다 지금 · 기준 · 바꿀 것 · 근거 조항.
function GapSections({ itemKey, f }: { itemKey: string; f: ServerFinding }) {
  return (
    <>
      <Section icon="activity" title="요약"><div className="box">{f.reason}</div></Section>
      <Section icon="warn" title={`정책과 다른 곳 ${f.gaps.length}`}>
        {f.gaps.length ? f.gaps.map((g, n) => (
          <div className="gap" key={n}>
            <div className="gap-head"><LevelDot level={g.level} />{g.item}</div>
            <table className="kv"><tbody>
              <tr><th>지금</th><td>{g.current}</td></tr>
              <tr><th>기준</th><td>{g.required}</td></tr>
              <tr><th>바꿀 것</th><td>{g.change}</td></tr>
            </tbody></table>
            {g.source && <SourceChips itemKey={`${itemKey}:gap${n}`} sources={[g.source]} />}
          </div>
        )) : <div className="box">기준 문서와 다른 곳을 찾지 못했습니다.</div>}
        {f.unjudged.length > 0 && <p className="note">다루는 조항이 없어 판단하지 않은 항목: {f.unjudged.join(", ")}</p>}
      </Section>
    </>
  );
}
