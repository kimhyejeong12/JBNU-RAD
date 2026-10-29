import { useState } from "react";
import { DECISIONS, DECISION_SET, decisionTone } from "./lib";
import { useDecide, type ReviewItem } from "./api";
import { DecisionLog } from "./DecisionLog";
import { useResults } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { PanelHead, PanelMsg } from "@/app/ui/panel/Panel";
import { SourceChips } from "@/app/ui/panel/SourceChips";
import type { EventFinding, PolicyIssue, PolicyRow, ServerFinding } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { Icon } from "@/shared/ui/base/Icon";
import { KvTable, LevelDot, Section } from "@/shared/ui/base/parts";
import { ModuleState } from "@/shared/ui/server/ModuleTables";
import { cn } from "@/shared/lib/cn";
import {
  box, boxPre, input, kvTable, kvTd, kvTh, levelText, meta, note, panelBody, panelFoot, panelFootTitle, recLine, subject, toolButton,
} from "@/shared/ui/base/styles";

// 정책 문제 · 서버 점검 · 로그 감시 판정의 근거와 운영자 결정.
export function ReviewPanel({ it }: { it: ReviewItem }) {
  const { openLogs } = useUi();
  const results = useResults();
  const r = it.raw;
  // 10/14부터 서버 점검은 다른 곳마다 지금 · 기준 · 바꿀 것을 따로 받습니다. 그 전 결과(recommendation 이 있음)는 예전 칸으로 보입니다.
  const gapped = it.type === "server" && !it.raw.failed && !it.raw.recommendation;

  return (
    <>
      <PanelHead title="AI 판단 근거" />
      <div className={panelBody}>
        <p className={subject}>{it.type === "policy" ? `${it.who} · ${it.raw.kind}` : it.raw.title}</p>
        <div className={cn(recLine, it.level && levelText[it.level])}><Icon name={(it.level && LEVEL_ICON[it.level]) || "warn"} className="size-5" />{it.level}</div>
        <div className={meta}>{it.id}</div>

        {it.type === "server" && <ServerSections f={it.raw} />}
        {it.type === "event" && <EventSection f={it.raw} onLogs={() => openLogs({ user: it.raw.title, period: "month" })} />}
        {it.type === "policy" && <PolicySection issue={it.raw} policies={results.policies} />}

        {gapped && it.type === "server" ? <GapSections itemKey={it.key} f={it.raw} /> : (
          <>
            <Section icon="activity" title="판단 이유"><div className={box}>{r.reason}</div></Section>
            <Section icon="ok" title="권고 조치"><div className={box}>{r.recommendation}</div></Section>
            <Section icon="db" title="근거 조항">
              {it.type !== "policy" ? <SourceChips itemKey={it.key} sources={r.sources} /> : <p className={note}>근거는 판단 이유에 함께 적혀 있습니다.</p>}
            </Section>
          </>
        )}
        {results.decision_log && <DecisionLog log={results.decision_log} it={it} />}
      </div>

      {it.type === "event" && it.raw.stage === "fast" ? (
        <div className={panelFoot}>
          <h4 className={panelFootTitle}>1차 판정 — 확정 대기</h4>
          <p className={note}>빠른 감시의 판정입니다. 정밀 감시가 확정하면 결정할 수 있습니다.</p>
        </div>
      ) : <DecisionFoot it={it} />}
    </>
  );
}

// 운영자 결정 — 의견과 함께 권한 DB 에 남고, 지금 결정과 [취소]를 보여줍니다. 결정 버튼은 종류마다 다릅니다.
function DecisionFoot({ it }: { it: ReviewItem }) {
  const decide = useDecide();
  const [comment, setComment] = useState("");
  const decision = it.decision;
  const act = (action: string) => decide.mutate({ it, action, comment }, { onSuccess: () => setComment("") });
  return (
    <div className={panelFoot}>
      <h4 className={panelFootTitle}>의사결정</h4>
      <textarea className={cn(input, "min-h-14 resize-y")} id="review-comment" maxLength={2000} placeholder="결정 의견 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-2 grid grid-cols-[repeat(3,1fr)] gap-2">
        {Object.entries(DECISION_SET[it.type]).map(([a, color]) => (
          // 지금 결정은 검은 테두리로 알립니다.
          <button key={a} aria-pressed={decision?.action === a} onClick={() => act(a)}
            className={cn("h-10 rounded-lg border border-solid text-[13.5px] font-bold hover:brightness-[0.97] aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ink", decisionTone[color])}>
            {DECISIONS[a]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-dim">
        {decision ? (
          <>
            <span>
              결정 <b className="text-ink">{DECISIONS[decision.action]}</b> · {`${decision.decider_department ?? ""} ${decision.decider_name}`.trim()} · {stamp(decision.decided_at)}
              {decision.ai_level ? ` (그때 AI 판정: ${decision.ai_level})` : ""}{decision.comment ? ` — ${decision.comment}` : ""}
            </span>
            <button id="undo" onClick={() => act("cancel")} className="border-none bg-transparent p-0 text-[12px] text-ink-dim underline">취소</button>
          </>
        ) : <span>AI는 권고만 합니다. 최종 결정은 사람이 내립니다.</span>}
      </div>
      <PanelMsg />
    </div>
  );
}

function ServerSections({ f }: { f: ServerFinding }) {
  const state = Object.entries(f.detail?.state ?? {}).filter(([, v]) => v) as [string, string][];
  return (
    <>
      {state.length > 0 && <Section icon="server" title="서버 현황"><KvTable rows={state} /></Section>}
      <ModuleState snap={f.detail?.snapshot} />
      <Section icon="file" title="이 서버에 걸린 정책"><div className={boxPre}>{f.detail?.matched}</div></Section>
    </>
  );
}

function EventSection({ f, onLogs }: { f: EventFinding; onLogs: () => void }) {
  return (
    <Section icon="file" title="판정한 로그">
      <div className={boxPre}>{f.detail?.events || "로그 없음"}</div>
      <button className={toolButton} id="to-logs" onClick={onLogs}><Icon name="search" small />이 사용자의 최근 한 달 로그</button>
    </Section>
  );
}

function PolicySection({ issue, policies }: { issue: PolicyIssue; policies: PolicyRow[] }) {
  const rows = policies.filter((p) => (issue.policy_ids || []).includes(p.policy_id));
  return (
    <Section icon="file" title="관련 정책 원본">
      <div className={box}>
        <table className={kvTable}>
          <tbody>
            {rows.length
              ? rows.map((p) => <tr key={p.policy_id}><th className={kvTh}>{p.policy_id}</th><td className={kvTd}>{`${p.solution} · ${p.source} → ${p.destination} · ${p.service} · ${p.action} · 만료 ${p.expires_at || "없음"}`}</td></tr>)
              : <tr><td className={kvTd}>정보 없음</td></tr>}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// 서버 점검 — 기준 문서와 다른 곳마다 지금 · 기준 · 바꿀 것 · 근거 조항. 이름 칸은 짧아 좁게 둡니다.
const GAP_TH = "w-[52px]";
function GapSections({ itemKey, f }: { itemKey: string; f: ServerFinding }) {
  return (
    <>
      <Section icon="activity" title="요약"><div className={box}>{f.reason}</div></Section>
      <Section icon="warn" title={`정책과 다른 곳 ${f.gaps.length}`}>
        {f.gaps.length ? f.gaps.map((g, n) => (
          <div className="mb-2 rounded-lg border border-line px-3 py-[10px]" key={n}>
            <div className="mb-1.5 text-[13px] font-bold"><LevelDot level={g.level} />{g.item}</div>
            <table className={kvTable}><tbody>
              <tr><th className={cn(kvTh, GAP_TH)}>지금</th><td className={kvTd}>{g.current}</td></tr>
              <tr><th className={cn(kvTh, GAP_TH)}>기준</th><td className={kvTd}>{g.required}</td></tr>
              <tr><th className={cn(kvTh, GAP_TH)}>바꿀 것</th><td className={kvTd}>{g.change}</td></tr>
            </tbody></table>
            {g.source && <SourceChips itemKey={`${itemKey}:gap${n}`} sources={[g.source]} className="mt-1.5" />}
          </div>
        )) : <div className={box}>기준 문서와 다른 곳을 찾지 못했습니다.</div>}
        {f.unjudged.length > 0 && <p className={note}>다루는 조항이 없어 판단하지 않은 항목: {f.unjudged.join(", ")}</p>}
      </Section>
    </>
  );
}
