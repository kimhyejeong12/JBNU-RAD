import { useState, type ReactNode } from "react";
import { useRequestAction, type RequestAct } from "./api";
import { useMe } from "@/app/me";
import { useUi } from "@/app/ui/UiContext";
import { PanelHead } from "@/app/ui/PanelHead";
import { SourceChips } from "@/app/ui/SourceChips";
import type { QueueItem } from "@/app/queue/types";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/levels";
import { STAGE_LABEL, STEP, period, requester } from "@/shared/lib/request";
import { History, type HistoryStep } from "@/shared/ui/History";
import { Icon } from "@/shared/ui/Icon";
import { KvTable } from "@/shared/ui/KvTable";
import { PanelMsg } from "@/shared/ui/PanelMsg";
import { Section } from "@/shared/ui/Section";

type RequestItem = Extract<QueueItem, { type: "req" | "mine" }>;

// 권한 신청 패널 — 결재자에게는 AI 판정과 결재 · 회수, 신청자에게는 상태와 철회.
// key 를 항목 key 로만 두어 폴링으로 다시 그려도 입력 중인 의견이 남습니다.
export function RequestPanel({ it }: { it: RequestItem }) {
  const me = useMe();
  const { ui, setPanelMsg } = useUi();
  const action = useRequestAction();
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");

  const r = it.raw;
  const applicant = me.role === "user";
  const v = r.ai_verdict;
  const canDecide = !applicant && r.stage === STEP[me.role];
  const canRevoke = !applicant && r.stage === "approved";
  const canWithdraw = applicant && r.stage === "manager";
  const rejudge = !applicant && !r.judging && r.stage === "manager";
  const no = r.request_no;

  const act = (a: RequestAct) => {
    if (a === "reject" && !confirm(`${no} 신청을 반려합니다. 반려하면 신청자는 새로 신청해야 합니다.`)) return;
    if (a === "revoke") {
      if (!reason.trim()) {
        setPanelMsg("회수 사유를 적어 주세요");
        return;
      }
      if (!confirm(`${no} 권한을 회수합니다.`)) return;
    }
    if (a === "withdraw" && !confirm(`${no} 신청을 철회합니다.`)) return;
    action.mutate({ no, act: a, comment, reason }, { onSuccess: () => { setComment(""); setReason(""); } });
  };

  let ai: ReactNode = null;
  if (!applicant) {
    if (r.judging) ai = <Section icon="activity" title="AI 판정"><div className="box">AI가 판정하고 있습니다… (수십 초)</div></Section>;
    else if (!v) ai = <Section icon="activity" title="AI 판정"><div className="box">아직 판정이 없습니다.</div></Section>;
    else if (v.failed) ai = <Section icon="activity" title="AI 판정"><div className="box warn">판정 실패 — {v.error || "원인 불명"}. 수동으로 검토하거나 다시 판정하세요.</div></Section>;
    else ai = (
      <>
        <Section icon="activity" title="AI 판단 이유"><div className="box">{v.reason}</div></Section>
        <Section icon="ok" title="AI 권고"><div className="box">{v.recommendation}</div></Section>
        <Section icon="db" title="근거 조항"><SourceChips itemKey={it.key} sources={v.sources} /></Section>
        <p className="note">{stamp(v.judged_at)} 판정</p>
      </>
    );
  }

  const steps: HistoryStep[] = [
    ...(r.approvals ?? []).map((a) => ({
      title: `${a.step === "manager" ? "1차" : "최종"} ${a.action === "approve" ? "승인" : "반려"}`,
      who: `${a.approver_name}${a.approver_department ? ` (${a.approver_department})` : ""}`,
      when: `${stamp(a.decided_at)}${!applicant && a.ai_level ? ` · 그때 AI 판정 ${a.ai_level}` : ""}`,
      say: a.comment,
    })),
    ...(r.revocation ? [{
      title: "회수",
      who: `${r.revocation.revoker_name}${r.revocation.revoker_department ? ` (${r.revocation.revoker_department})` : ""}`,
      when: stamp(r.revocation.revoked_at),
      say: r.revocation.reason,
    }] : []),
  ];

  let foot: ReactNode;
  if (canDecide) {
    foot = (
      <>
        <h4>{me.role === "manager" ? "1차 결재" : "최종 결재"}</h4>
        <textarea id="decision-comment" maxLength={2000} placeholder="결재 의견 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="panel-actions"><button className="good" onClick={() => act("approve")}>승인</button><button className="danger" onClick={() => act("reject")}>반려</button></div>
        <p className="note">AI는 권고만 합니다.</p>
      </>
    );
  } else if (canRevoke) {
    foot = (
      <>
        <h4>권한 회수</h4>
        <input id="revoke-reason" maxLength={2000} placeholder="회수 사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="panel-actions"><button className="danger" onClick={() => act("revoke")}>회수</button></div>
      </>
    );
  } else if (canWithdraw) {
    foot = (
      <>
        <h4>신청 철회</h4><p className="note">1차 결재 전에만 철회할 수 있습니다. 반려 · 철회 뒤에는 새로 신청합니다.</p>
        <div className="panel-actions"><button onClick={() => act("withdraw")}>철회</button></div>
      </>
    );
  } else {
    foot = (
      <>
        <h4>{STAGE_LABEL[r.stage]}</h4>
        <p className="note">
          {applicant ? "결재가 끝나거나 진행 중인 신청입니다."
            : r.stage === "manager" || r.stage === "top" ? `${STAGE_LABEL[r.stage]} — 내 결재 단계가 아닙니다.` : "더 할 결재가 없습니다."}
        </p>
      </>
    );
  }

  const rows: [string, ReactNode][] = [
    ["신청자", requester(r)],
    ["신청 권한", r.access_code ? `${r.requested_access} (${r.access_code})` : r.requested_access],
    ["신청 때 보유 권한", r.current_access || "—"],
    ["신청 사유", r.reason || "—"],
    ["사용 기간", period(r)],
    ["신청 시각", stamp(r.submitted_at)],
    ["상태", STAGE_LABEL[r.stage]],
  ];

  return (
    <>
      <PanelHead title={applicant ? "내 신청" : "권한 신청 검토"}>
        {rejudge && <button className="rerun" onClick={() => act("rejudge")}><Icon name="activity" className="sm" />다시 판정</button>}
      </PanelHead>
      <div className="panel-body">
        <p className="subject">{r.requested_access}</p>
        {!applicant && (
          <div className={it.level ? `rec-line lv-${it.level}` : "rec-line"}>
            {it.level && <Icon name={LEVEL_ICON[it.level]} />}{it.judge}
          </div>
        )}
        <div className="meta">{r.request_no} · {STAGE_LABEL[r.stage]}</div>
        <Section icon="file" title="신청 내용"><KvTable rows={rows} /></Section>
        {ai}
        <Section icon="list" title="결재 기록">
          {steps.length ? <History steps={steps} /> : <p className="note">아직 결재가 없습니다.</p>}
        </Section>
      </div>
      <div className="panel-foot">{foot}<PanelMsg msg={ui.panelMsg} /></div>
    </>
  );
}
