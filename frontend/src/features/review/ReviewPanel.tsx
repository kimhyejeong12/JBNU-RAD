import { useState } from "react";
import { compactLog } from "./lib";
import type { ReviewItem } from "./api";
import { DecisionLog } from "./DecisionLog";
import { useResults } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { PanelHead } from "@/app/ui/panel/Panel";
import { DecisionBadge, DecisionFoot, JudgeState } from "@/app/ui/panel/DecisionFoot";
import { SourceChips } from "@/app/ui/panel/SourceChips";
import type { EventFinding, ServerFinding, Snapshot } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/base/Icon";
import { LevelDot, Meta, Section } from "@/shared/ui/base/parts";
import { ModuleChanges, ModuleTables } from "@/shared/ui/server/ModuleTables";
import { cn } from "@/shared/lib/cn";
import {
  box, boxPre, kvTable, kvTd, kvTh, note, panelBody, panelFoot, panelFootTitle, subject, toolButton,
} from "@/shared/ui/base/styles";

export function ReviewPanel({ it }: { it: ReviewItem }) {
  const { openLogs } = useUi();
  const results = useResults();
  const r = it.raw;
  // 10/14 전 서버 점검 결과(recommendation 이 있음)는 예전 칸으로 보입니다.
  const gapped = it.type === "server" && !it.raw.failed && !it.raw.recommendation;
  const title = it.type === "policy" ? `${it.who} ${it.raw.kind}` : it.raw.title;
  const fast = it.type === "event" && it.raw.stage === "fast";

  return (
    <>
      <PanelHead title="AI 분석" />
      <div className={panelBody}>
        <p className={subject}>{title}</p>
        <JudgeState level={it.level}>{fast ? <span className="text-[12px] font-bold text-ink-dim">확정 대기</span> : <DecisionBadge decision={it.decision} />}</JudgeState>

        {/* 원자료가 길어 결론이 밀려나지 않게 결론을 먼저 둡니다. */}
        {it.type === "event" && <EventWhat f={it.raw} />}
        {gapped && it.type === "server" ? <GapSections itemKey={it.key} f={it.raw} /> : (
          <>
            <Section icon="activity" title="이유"><div className={box}>{r.reason}</div></Section>
            <Section icon="db" title="관련 규정"><SourceChips itemKey={it.key} sources={it.type === "policy" ? it.raw.policy_ids : r.sources} /></Section>
            <Section icon="ok" title="조치 방법"><div className={box}>{r.recommendation}</div></Section>
          </>
        )}

        {it.type === "server" && <ServerSections f={it.raw} />}
        {it.type === "event" && <EventSection f={it.raw} onLogs={() => openLogs({ user: it.raw.title, period: "month" })} />}
        {results.decision_log && <DecisionLog log={results.decision_log} it={it} />}
      </div>

      {fast ? (
        <div className={panelFoot}>
          <h4 className={panelFootTitle}>1차 판정 (확정 대기)</h4>
        </div>
      ) : <DecisionFoot decision={it.decision} target={{ kind: it.type, itemKey: it.itemKey!, level: it.level || null, subject: title }} />}
    </>
  );
}

// 누가 어디서 무엇을 했는지 한 줄로 — 원문 줄은 아래에 접어 둡니다.
function EventWhat({ f }: { f: EventFinding }) {
  const log = compactLog(f.detail?.events ?? "");
  return (
    <Section icon="eye" title="무슨 일">
      <div className={box}>
        <Meta items={[log.head || f.title, `로그 ${log.lines.length}줄`, f.detail?.last_event_at && `마지막 ${stamp(f.detail.last_event_at)}`]} />
      </div>
    </Section>
  );
}

function ServerSections({ f }: { f: ServerFinding }) {
  const snap = f.detail?.snapshot;
  return (
    <>
      {snap?.modules && (
        <>
          {snap.changes?.length ? <ModuleChanges snap={snap} /> : <p className={cn(note, "mt-3.5")}>바뀐 설정 없음</p>}
          <ModuleFold snap={snap} />
        </>
      )}
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
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const log = compactLog(f.detail?.events ?? "");
  const shown = all ? log.lines : log.lines.slice(-RECENT_LOGS);
  const hidden = log.lines.length - shown.length;
  return (
    <Section icon="file" title={`판정한 로그 ${log.lines.length}줄`}>
      {open && (
        <>
          {log.head && <p className={cn(note, "mb-1.5")}>{log.head}</p>}
          <div className={boxPre}>{shown.join("\n") || "로그 없음"}</div>
        </>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={cn(toolButton, "ml-0")} id="log-raw" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="file" small />{open ? "원문 접기" : "원문 보기"}</button>
        {open && hidden > 0 && <button className={cn(toolButton, "ml-0")} onClick={() => setAll(true)}>앞의 {hidden}줄 더 보기</button>}
        <button className={cn(toolButton, "ml-0")} id="to-logs" onClick={onLogs}><Icon name="search" small />이 사용자의 최근 한 달 로그</button>
      </div>
    </Section>
  );
}

const GAP_TH = "w-13";
function GapSections({ itemKey, f }: { itemKey: string; f: ServerFinding }) {
  return (
    <>
      <Section icon="activity" title="이유"><div className={box}>{f.reason}</div></Section>
      <Section icon="db" title={`기준과 다른 곳 ${f.gaps.length}`}>
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
        {f.unjudged.length > 0 && <p className={note}>판단 안 함: {f.unjudged.join(", ")}</p>}
      </Section>
    </>
  );
}
