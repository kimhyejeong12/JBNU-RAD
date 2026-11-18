import { useState } from "react";
import { useResults } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { TYPE_LABEL } from "@/app/session/views";
import { AiCaption, AiReport, SourceChips } from "@/app/ui/panel/AiReport";
import { Panel } from "@/app/ui/panel/Panel";
import { DecisionBadge, DecisionFoot } from "@/app/ui/panel/DecisionFoot";
import { DECISIONS } from "@/app/ui/panel/decision";
import { compactLog, countText, logFacts, logRows, type DecisionLogMap } from "./lib";
import type { ReviewItem } from "@/features/review/lib";
import type { EventFinding, ServerFinding, SnapshotState } from "@/shared/api/types";
import { stamp, person } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { LevelDot, Meta, Periods, Section, ModuleChanges, ModuleTables, History, Subject } from "@/shared/ui/parts";
import { cn } from "@/shared/lib/cn";
import { box, boxPre, kvTable, kvTd, kvTh, note, panelFoot, panelFootTitle, toolButton, toolButtonInline } from "@/shared/ui/styles";

type PanelTab = "ai" | "log";

// 다른 줄을 고르면 [AI 분석]으로 돌아가게 항목 key 로 다시 그림
export function ReviewPanel({ it }: { it: ReviewItem }) {
  return <Review key={it.key} it={it} />;
}

function Review({ it }: { it: ReviewItem }) {
  const { openLogs } = useUi();
  const [tab, setTab] = useState<PanelTab>("ai");
  const results = useResults();
  const r = it.raw;
  // 10/14 전 서버 점검 결과(recommendation 이 있음)는 예전 칸으로 보임
  const gapped = it.type === "server" && !it.raw.failed && !it.raw.recommendation;
  const title = it.type === "policy" ? `${it.who} ${it.raw.kind}` : it.raw.title;
  const fast = it.type === "event" && it.raw.stage === "fast";

  const foot = fast
    ? <div className={panelFoot}><h4 className={panelFootTitle}>1차 판정 (확정 대기)</h4></div>
    : <DecisionFoot decision={it.decision} target={{ kind: it.type, itemKey: it.itemKey!, level: it.level || null, subject: title }} />;
  return (
    <Panel title={`${TYPE_LABEL[it.type]} 검토`} foot={foot}>
      <Subject title={title} infoClass="flex items-center gap-1.5" info={<>처리 상태{fast ? <b className="text-ink-dim">확정 대기</b> : <DecisionBadge decision={it.decision} />}</>} />
      {/* 결정 기록이 길어도 AI 분석이 밀리지 않게 탭으로 나눔 — 지금 결정은 아래 처리 칸에 늘 보임 */}
      {!fast && (
        <Periods<PanelTab> id="review-tabs" label="패널 보기" fill className="mt-3" value={tab} onChange={setTab}
          labels={[["ai", "AI 분석"], ["log", `결정 기록 ${logRows(results.decision_log ?? {}, it).length}`]]} />
      )}
      {tab === "log" && !fast ? <DecisionLog log={results.decision_log ?? {}} it={it} /> : (
        <>
          {/* 원자료가 길어 결론이 밀려나지 않게 결론을 먼저 둠 */}
          <AiReport itemKey={it.key} wait="판정 결과가 없습니다." how="어떻게 조치할까요?" tip={it.type === "policy" ? it.raw.kind : undefined}
            what={it.type === "event" ? <EventWhat f={it.raw} /> : undefined}
            f={it.level ? {
              level: it.level, reason: r.reason, recommendation: r.recommendation,
              // 서버 점검은 다른 곳마다 근거 조항이 붙어 아래 목록에 둠
              sources: gapped ? undefined : it.type === "policy" ? it.raw.policy_ids : it.raw.sources,
            } : null}
            why={gapped && it.type === "server" && <GapList itemKey={it.key} f={it.raw} />} />
          {it.type === "server" && <ServerSections f={it.raw} />}
          {it.type === "event" && <EventSection f={it.raw} onLogs={() => openLogs({ user: it.raw.title, period: "month" })} />}
        </>
      )}
    </Panel>
  );
}

// 무슨 일 — 로그에서 센 누가 · 무엇을 · 어디서 · 언제. 줄을 읽지 못하면 머리 · 줄 수 · 마지막 시각
function EventWhat({ f }: { f: EventFinding }) {
  const facts = logFacts(f.detail?.events ?? "");
  if (!facts) {
    const log = compactLog(f.detail?.events ?? "");
    return <Meta items={[log.head || f.title, `로그 ${log.lines.length}줄`, f.detail?.last_event_at && `마지막 ${stamp(f.detail.last_event_at)}`]} />;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <b>{facts.head}</b>
      <span>{countText(facts.acts)}</span>
      <Meta className="text-[12px] text-ink-dim" items={[countText(facts.places), `${facts.first} ~ ${facts.last}`]} />
    </div>
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
// 노드 탭 패널에도 같은 표가 있어 모듈 상태는 접어 둠
function ModuleFold({ snap }: { snap: SnapshotState }) {
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
        <button className={toolButtonInline} id="log-raw" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="file" small />{open ? "원문 접기" : "원문 보기"}</button>
        {open && hidden > 0 && <button className={toolButtonInline} onClick={() => setAll(true)}>앞의 {hidden}줄 더 보기</button>}
        <button className={toolButtonInline} id="to-logs" onClick={onLogs}><Icon name="search" small />이 사용자의 최근 한 달 로그</button>
      </div>
    </Section>
  );
}

// 서버 점검의 "기준과 다른 곳" — AI 분석 결과 2번(왜) 아래에 붙음
const GAP_TH = "w-13";
function GapList({ itemKey, f }: { itemKey: string; f: ServerFinding }) {
  return (
    <>
      <AiCaption>기준 불일치 {f.gaps.length}</AiCaption>
      {f.gaps.length ? f.gaps.map((g, n) => (
        <div className="mb-2 rounded-lg border border-line px-3 py-2.5" key={n}>
          <div className="mb-1.5 text-[13px] font-bold"><LevelDot level={g.level} />{g.item}</div>
          <table className={kvTable}><tbody>
            <tr><th className={cn(kvTh, GAP_TH)}>지금</th><td className={kvTd}>{g.current}</td></tr>
            <tr><th className={cn(kvTh, GAP_TH)}>기준</th><td className={kvTd}>{g.required}</td></tr>
            <tr><th className={cn(kvTh, GAP_TH)}>조치</th><td className={kvTd}>{g.change}</td></tr>
          </tbody></table>
          {g.source && <SourceChips itemKey={`${itemKey}:gap${n}`} sources={[g.source]} className="mt-1.5" />}
        </div>
      )) : <div className={box}>기준 문서와 어긋난 설정이 없습니다.</div>}
      {f.unjudged.length > 0 && <p className={note}>판단 제외: {f.unjudged.join(", ")}</p>}
    </>
  );
}

// 결정을 이어받은 판정은 자기 기록이 없어 지난 판정의 기록을 보여줌
export function DecisionLog({ log, it }: { log: DecisionLogMap; it: ReviewItem }) {
  const from = it.decision?.carried_from;
  // 최신부터 — 맨 위 줄이 지금 처리 상태
  const steps = [...logRows(log, it)].reverse().map((d) => ({
    title: d.action === "cancel" ? "결정 취소" : DECISIONS[d.action],
    who: person(d.decider_name, d.decider_department),
    when: stamp(d.decided_at),
    say: d.comment,
  }));
  return (
    <Section icon="list" title={from ? "결정 기록 (이어받은 지난 판정)" : "결정 기록"}>
      {steps.length ? <History steps={steps} /> : <p className={note}>아직 결정이 없습니다.</p>}
    </Section>
  );
}
