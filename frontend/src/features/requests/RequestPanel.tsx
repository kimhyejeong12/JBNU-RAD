import { Fragment, useState, type ReactNode } from "react";
import { ask } from "@/app/ui/confirm/ask";
import { useRequestAction, type RequestAct } from "./api";
import { approvalFlow, moveText, type FlowState } from "./lib";
import { useMe } from "@/app/session/me";
import { AiReport } from "@/app/ui/panel/AiReport";
import { Panel, PanelMsg } from "@/app/ui/panel/Panel";
import { SourceChips } from "@/app/ui/panel/SourceChips";
import { useUi } from "@/app/ui/state/UiContext";
import type { QueueItem } from "@/app/queue/types";
import type { RequestRow, Role } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON, LEVEL_TIP } from "@/shared/lib/labels";
import { STAGE_LABEL, STEP, period, requester } from "@/shared/lib/request";
import { KvTable, Meta, Section } from "@/shared/ui/base/parts";
import { Icon } from "@/shared/ui/base/Icon";
import { cn } from "@/shared/lib/cn";
import {
  actionButton, box, dangerButton, goodButton, input, levelText, meta, note, panelActions, panelFoot, panelFootTitle, recLine, subject, toolButton,
} from "@/shared/ui/base/styles";

type RequestItem = Extract<QueueItem, { type: "req" }>;
interface Draft { comment: string; reason: string }

// key 를 항목 key 로만 두어 폴링으로 다시 그려도 입력 중인 의견이 남습니다.
export function RequestPanel({ it }: { it: RequestItem }) {
  const me = useMe();
  const { setPanelMsg } = useUi();
  const action = useRequestAction();
  const [draft, setDraft] = useState<Draft>({ comment: "", reason: "" });
  const r = it.raw;
  const no = r.request_no;
  const rejudge = !r.judging && r.stage === "manager";

  const act = async (a: RequestAct) => {
    if (a === "reject" && !(await ask({ title: "신청 반려", confirm: "반려", danger: true, message: `${no} 신청을 반려합니다. 반려하면 신청자는 새로 신청해야 합니다.` }))) return;
    if (a === "revoke") {
      if (!draft.reason.trim()) {
        setPanelMsg("회수 사유를 적어 주세요");
        return;
      }
      if (!(await ask({ title: "권한 회수", confirm: "회수", danger: true, message: `${no} 권한을 회수합니다.` }))) return;
    }
    action.mutate({ no, act: a, ...draft }, { onSuccess: () => setDraft({ comment: "", reason: "" }) });
  };

  const rows: [string, ReactNode][] = [
    ["신청자", requester(r)],
    ["신청 때 직무", r.requester_job || "적지 않음"],
    ["신청 권한", r.access_code ? `${r.requested_access} (${r.access_code})` : r.requested_access],
    ["신청 사유", r.reason || "—"],
    ["사용 기간", period(r)],
  ];
  const v = r.ai_verdict;
  const level = v && !v.failed ? v.level : null;
  return (
    <Panel title="권한 신청 검토"
      actions={rejudge && <button className={toolButton} onClick={() => act("rejudge")}><Icon name="refresh" small />다시 판정</button>}
      foot={<div className={panelFoot}><RequestFoot r={r} role={me.role} draft={draft} onDraft={setDraft} act={act} /><PanelMsg /></div>}>
      <p className={subject}>{r.requested_access}</p>
      <div className={meta}><Meta items={[no, requester(r)]} /></div>
      <Flow r={r} />
      <Section icon="file" title="신청 내용"><KvTable rows={rows} /></Section>
      <AiReport itemKey={it.key} f={v && level ? { level, reason: v.reason, recommendation: v.recommendation, sources: v.sources, judgedAt: v.judged_at } : null}
        wait={r.judging ? "AI 판정 중…" : !v ? "아직 판정이 없습니다." : <span className="text-risk">판정 실패: {v.error || "원인 불명"}</span>}
        tip={level ? LEVEL_TIP[level] : undefined} lead={level && <b className={cn("mr-1.5", levelText[level])}>{LEVEL_TIP[level]}</b>} />
      {r.grant_review && <GrantReview it={it} />}
    </Panel>
  );
}

const FLOW_MARK: Record<FlowState, string> = {
  done: "bg-ok-tint text-ok", rejected: "bg-risk-tint text-risk", current: "bg-brand text-white", idle: "border border-line bg-surface text-ink-faint", stopped: "bg-line text-ink-dim",
};
const FLOW_LABEL: Record<FlowState, string> = { done: "text-ok", rejected: "text-risk", current: "text-ink", idle: "text-ink-faint", stopped: "text-ink-dim" };

// 결재 단계 — 처리 상태 배지 · 결재 기록 칸을 이 한 줄로 대신합니다.
function Flow({ r }: { r: RequestRow }) {
  const { steps, notes } = approvalFlow(r);
  return (
    <div className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2.5">
      <div className="flex items-center gap-2" aria-label="결재 단계">
        {steps.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden="true" className="h-px min-w-2 flex-1 bg-line" />}
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn("flex size-6 flex-none items-center justify-center rounded-full text-[11px] font-bold", FLOW_MARK[s.state])}>
                {s.state === "done" ? <Icon name="check" small /> : s.state === "rejected" || s.state === "stopped" ? <Icon name="close" small /> : i + 1}
              </span>
              <span className="min-w-0 leading-tight">
                <span className={cn("block truncate text-[11.5px] font-semibold", FLOW_LABEL[s.state])}>{s.label}</span>
                {s.state === "current" ? <span className="block text-[12px] text-ink-dim">대기 중</span>
                  : s.who && <span className="block truncate text-[12.5px] font-bold">{s.who}</span>}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
      {notes.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5 border-t border-line pt-2 text-[12px]">
          {notes.map((n, i) => <p key={i} className="m-0"><b className={cn("mr-1.5", n.alert && "text-risk")}>{n.label}</b>{n.text}</p>)}
        </div>
      )}
    </div>
  );
}

function GrantReview({ it }: { it: RequestItem }) {
  const g = it.raw.grant_review!;
  const v = g.verdict;
  const why = g.cause === "leave" ? `${g.left_on} 퇴사` : `이동 ${moveText(g.move!)}`;
  const title = "보유 권한 재검토";
  if (!v) return <Section icon="activity" title={title}><div className={box}>{why} — {g.judging ? "AI 판정 중…" : "판정 대기"}</div></Section>;
  if (v.failed || !v.level) return <Section icon="activity" title={title}><div className={cn(box, "text-risk")}>{why} — 판정 실패: {v.error || "원인 불명"}</div></Section>;
  return (
    <Section icon="activity" title={title}>
      <div className={cn(recLine, levelText[v.level])}><Icon name={LEVEL_ICON[v.level]} className="size-5" />{v.level}</div>
      <p className={note}><Meta items={[why, v.by === "code" ? "퇴사일 기준" : `${stamp(v.judged_at)} 판정`]} /></p>
      <div className={box}>{v.reason}</div>
      <div className={cn(box, "mt-1.5")}>{v.recommendation}</div>
      {v.sources.length > 0 && <SourceChips itemKey={`${it.key}:grant`} sources={v.sources} />}
    </Section>
  );
}

function RequestFoot({ r, role, draft, onDraft, act }: { r: RequestRow; role: Role; draft: Draft; onDraft: (d: Draft) => void; act: (a: RequestAct) => void }) {
  if (r.stage === STEP[role]) {
    return (
      <>
        <h4 className={panelFootTitle}>{role === "manager" ? "1차 결재" : "최종 결재"}</h4>
        <textarea className={cn(input, "min-h-14 resize-y")} id="decision-comment" maxLength={2000} placeholder="결재 의견 (선택)" value={draft.comment} onChange={(e) => onDraft({ ...draft, comment: e.target.value })} />
        <div className={panelActions}>
          <button className={cn(actionButton, goodButton, "flex-1")} onClick={() => act("approve")}>승인</button>
          <button className={cn(actionButton, dangerButton, "flex-1")} onClick={() => act("reject")}>반려</button>
        </div>
      </>
    );
  }
  if (r.stage === "approved") {
    return (
      <>
        <h4 className={panelFootTitle}>권한 회수</h4>
        <input className={input} id="revoke-reason" maxLength={2000} placeholder="회수 사유 (필수)" value={draft.reason} onChange={(e) => onDraft({ ...draft, reason: e.target.value })} />
        <div className={panelActions}><button className={cn(actionButton, dangerButton, "flex-1")} onClick={() => act("revoke")}>회수</button></div>
      </>
    );
  }
  return (
    <>
      <h4 className={panelFootTitle}>{STAGE_LABEL[r.stage]}</h4>
      <p className={note}>
        {r.stage === "manager" || r.stage === "top" ? "내 결재 단계가 아닙니다." : "결재가 끝났습니다."}
      </p>
    </>
  );
}
