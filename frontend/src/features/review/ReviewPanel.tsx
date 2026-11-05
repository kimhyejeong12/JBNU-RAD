import { useState } from "react";
import { DECISIONS, DECISION_SET, compactLog, decisionTone } from "./lib";
import { useDecide, type ReviewItem } from "./api";
import { DecisionLog } from "./DecisionLog";
import { useResults } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { PanelHead, PanelMsg } from "@/app/ui/panel/Panel";
import { SourceChips } from "@/app/ui/panel/SourceChips";
import type { EventFinding, PolicyIssue, PolicyRow, ServerFinding, Snapshot } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { Icon } from "@/shared/ui/base/Icon";
import { KvTable, LevelDot, Section } from "@/shared/ui/base/parts";
import { ModuleChanges, ModuleTables } from "@/shared/ui/server/ModuleTables";
import { cn } from "@/shared/lib/cn";
import {
  box, boxPre, input, kvTable, kvTd, kvTh, levelText, note, panelBody, panelFoot, panelFootTitle, recLine, subject, toolButton,
} from "@/shared/ui/base/styles";

export function ReviewPanel({ it }: { it: ReviewItem }) {
  const { openLogs } = useUi();
  const results = useResults();
  const r = it.raw;
  // 10/14 전 서버 점검 결과(recommendation 이 있음)는 예전 칸으로 보입니다.
  const gapped = it.type === "server" && !it.raw.failed && !it.raw.recommendation;
  const title = it.type === "policy" ? `${it.who} · ${it.raw.kind}` : it.raw.title;

  return (
    <>
      <PanelHead title="AI 판단 근거" />
      <div className={panelBody}>
        <p className={subject}>{title}</p>
        <div className={cn(recLine, it.level && levelText[it.level])}><Icon name={(it.level && LEVEL_ICON[it.level]) || "warn"} className="size-5" />{it.level}</div>

        {/* 원자료가 길어 결론이 밀려나지 않게 결론을 먼저 둡니다. */}
        {gapped && it.type === "server" ? <GapSections itemKey={it.key} f={it.raw} /> : (
          <>
            <Section icon="activity" title="판단 이유"><div className={box}>{r.reason}</div></Section>
            <Section icon="ok" title="권고 조치"><div className={box}>{r.recommendation}</div></Section>
            {it.type !== "policy" && <Section icon="db" title="근거 조항"><SourceChips itemKey={it.key} sources={r.sources} /></Section>}
          </>
        )}

        {it.type === "server" && <ServerSections f={it.raw} />}
        {it.type === "event" && <EventSection f={it.raw} onLogs={() => openLogs({ user: it.raw.title, period: "month" })} />}
        {it.type === "policy" && <PolicySection issue={it.raw} policies={results.policies} />}
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

function DecisionFoot({ it }: { it: ReviewItem }) {
  const decide = useDecide();
  const [comment, setComment] = useState("");
  const decision = it.decision;
  const act = (action: string) => decide.mutate({ it, action, comment }, { onSuccess: () => setComment("") });
  const choices = Object.entries(DECISION_SET[it.type]);
  return (
    <div className={panelFoot}>
      <h4 className={panelFootTitle}>의사결정</h4>
      <textarea className={cn(input, "min-h-14 resize-y")} id="review-comment" maxLength={2000} placeholder="결정 의견 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
        {choices.map(([a, color]) => (
          <button key={a} aria-pressed={decision?.action === a} onClick={() => act(a)}
            className={cn("h-9 rounded-lg border border-solid text-[13.5px] font-bold hover:brightness-[0.97] aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ink", decisionTone[color])}>
            {DECISIONS[a]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-dim">
        {decision ? (
          <>
            <span className="min-w-0 flex-1">
              결정 <b className="text-ink">{DECISIONS[decision.action]}</b> · {`${decision.decider_department ?? ""} ${decision.decider_name}`.trim()} · {stamp(decision.decided_at)}
              {decision.ai_level ? ` (그때 AI 판정: ${decision.ai_level})` : ""}{decision.comment ? ` — ${decision.comment}` : ""}
              {decision.carried_from ? " · 같은 결과의 지난 판정에서 이어짐" : ""}
            </span>
            <button id="undo" onClick={() => act("cancel")} className="shrink-0 self-start border-none bg-transparent p-0 text-[12px] whitespace-nowrap text-ink-dim underline">취소</button>
          </>
        ) : <span>AI는 권고만 합니다. 최종 결정은 사람이 내립니다.</span>}
      </div>
      <PanelMsg />
    </div>
  );
}

function ServerSections({ f }: { f: ServerFinding }) {
  const state = Object.entries(f.detail?.state ?? {}).filter(([, v]) => v) as [string, string][];
  const snap = f.detail?.snapshot;
  return (
    <>
      {state.length > 0 && <Section icon="server" title="서버 현황"><KvTable rows={state} /></Section>}
      {snap?.modules && (
        <>
          {snap.changes?.length ? <ModuleChanges snap={snap} /> : <p className={cn(note, "mt-3.5")}>직전 수집과 달라진 설정 없음</p>}
          <ModuleFold snap={snap} />
        </>
      )}
      <Section icon="file" title="이 서버에 걸린 정책"><div className={boxPre}>{f.detail?.matched}</div></Section>
    </>
  );
}

const RECENT_LOGS = 5;
// 노드 탭 패널에도 같은 표가 있어 모듈 상태는 접어 둡니다.
function ModuleFold({ snap }: { snap: Snapshot }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={cn(toolButton, "mt-3.5 ml-0")} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="db" small />{open ? "모듈 상태 접기" : "모듈 상태 보기"}</button>
      {open && <ModuleTables snap={snap} />}
    </>
  );
}

function EventSection({ f, onLogs }: { f: EventFinding; onLogs: () => void }) {
  const [all, setAll] = useState(false);
  const log = compactLog(f.detail?.events ?? "");
  const shown = all ? log.lines : log.lines.slice(-RECENT_LOGS);
  const hidden = log.lines.length - shown.length;
  return (
    <Section icon="file" title={`판정한 로그 ${log.lines.length}줄`}>
      {log.head && <p className={cn(note, "mb-1.5")}>{log.head}</p>}
      <div className={boxPre}>{shown.join("\n") || "로그 없음"}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {hidden > 0 && <button className={cn(toolButton, "ml-0")} onClick={() => setAll(true)}>앞의 {hidden}줄 더 보기</button>}
        <button className={cn(toolButton, "ml-0")} id="to-logs" onClick={onLogs}><Icon name="search" small />이 사용자의 최근 한 달 로그</button>
      </div>
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

const GAP_TH = "w-13";
function GapSections({ itemKey, f }: { itemKey: string; f: ServerFinding }) {
  return (
    <>
      <Section icon="activity" title="요약"><div className={box}>{f.reason}</div></Section>
      <Section icon="warn" title={`정책과 다른 곳 ${f.gaps.length}`}>
        {f.gaps.length ? f.gaps.map((g, n) => (
          <div className="mb-2 rounded-lg border border-line px-3 py-2.5" key={n}>
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
