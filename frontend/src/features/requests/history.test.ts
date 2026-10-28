import { expect, test } from "vitest";
import type { RequestRow } from "@/shared/api/types";
import { approvalSteps } from "./history";

const row = (extra: Partial<RequestRow>): RequestRow => ({ approvals: [], revocation: null, ...extra } as RequestRow);
const approval = { step: "manager", action: "approve", approver_name: "박운영", approver_department: "보안팀", decided_at: "2026-10-29T03:49:00+09:00", ai_level: "주의", comment: "확인했습니다" } as const;

test("결재 기록 — 단계 · 결정 · 이름 (부서) · 시각 · 그때 AI 판정 · 의견", () => {
  expect(approvalSteps(row({ approvals: [approval] }), false)).toEqual([
    { title: "1차 승인", who: "박운영 (보안팀)", when: "2026-10-29 03:49 · 그때 AI 판정 주의", say: "확인했습니다" },
  ]);
});

test("신청자에게는 그때 AI 판정을 보이지 않는다", () => {
  expect(approvalSteps(row({ approvals: [approval] }), true)[0].when).toBe("2026-10-29 03:49");
});

test("최종 반려와 회수는 기록 끝에 붙는다", () => {
  const steps = approvalSteps(row({
    approvals: [approval, { ...approval, step: "top", action: "reject", approver_department: null, comment: null }],
    revocation: { revoker_name: "최책임", revoker_department: null, revoked_at: "2026-10-30T09:00:00+09:00", reason: "퇴사" },
  }), false);
  expect(steps.map((s) => s.title)).toEqual(["1차 승인", "최종 반려", "회수"]);
  expect(steps[1].who).toBe("박운영");
  expect(steps[2]).toEqual({ title: "회수", who: "최책임", when: "2026-10-30 09:00", say: "퇴사" });
});
