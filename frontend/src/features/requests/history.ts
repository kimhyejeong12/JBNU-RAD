import type { RequestRow } from "@/shared/api/types";
import { person, stamp } from "@/shared/lib/format";
import type { HistoryStep } from "@/shared/ui/History";

// 결재 기록 — 1차 · 최종 결재와 회수를 순서대로. 신청자에게는 그때 AI 판정을 보이지 않습니다.
export function approvalSteps(r: RequestRow, applicant: boolean): HistoryStep[] {
  const steps: HistoryStep[] = (r.approvals ?? []).map((a) => ({
    title: `${a.step === "manager" ? "1차" : "최종"} ${a.action === "approve" ? "승인" : "반려"}`,
    who: person(a.approver_name, a.approver_department),
    when: `${stamp(a.decided_at)}${!applicant && a.ai_level ? ` · 그때 AI 판정 ${a.ai_level}` : ""}`,
    say: a.comment,
  }));
  if (r.revocation) {
    steps.push({ title: "회수", who: person(r.revocation.revoker_name, r.revocation.revoker_department), when: stamp(r.revocation.revoked_at), say: r.revocation.reason });
  }
  return steps;
}
