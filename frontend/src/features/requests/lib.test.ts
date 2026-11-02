import { expect, test } from "vitest";
import type { RequestRow, AccessItem } from "@/shared/api/types";
import { mineItem, requestItem, accessOptions, approvalSteps, canWithdraw, heldLabel, rejectNote } from "./lib";

const row = (p: Partial<RequestRow>): RequestRow => ({
  request_no: "REQ-2026-0001", requester_name: "김민수", requester_department: "인사팀", requested_access: "인사정보 조회",
  access_code: "HR_READ", current_access: null, reason: null, period_start: null, period_end: null,
  submitted_at: "2026-10-29T03:00:00+09:00", stage: "manager", approvals: [], revocation: null, ...p,
});

test("requestItem: 판정 중 · 판정 대기 · 판정 실패 · 등급", () => {
  expect(requestItem(row({ judging: true })).judge).toBe("판정 중");
  expect(requestItem(row({})).judge).toBe("판정 대기");
  const failed = requestItem(row({ ai_verdict: { level: "주의", reason: "", recommendation: "", sources: [], failed: true } }));
  expect(failed.judge).toBe("판정 실패");
  expect(failed.level).toBeUndefined();
  const ok = requestItem(row({ ai_verdict: { level: "위험", reason: "r", recommendation: "c", sources: [] } }));
  expect(ok).toMatchObject({ type: "req", key: "req:REQ-2026-0001", id: "REQ-2026-0001", level: "위험", judge: "위험", who: "인사팀 김민수", what: "인사정보 조회", when: "2026-10-29 03:00" });
});

test("requestItem: 상태 글자 — 기간이 끝난 승인은 따로", () => {
  expect(requestItem(row({ stage: "manager" })).sub).toBe("1차 결재 대기");
  expect(requestItem(row({ stage: "approved", period_end: "2000-01-01" })).sub).toBe("승인 · 기간 끝");
  expect(requestItem(row({ stage: "approved", period_end: null })).sub).toBe("승인");
});

test("철회는 1차 결재를 기다리는 신청만 — 그 뒤에는 결재가 진행됐거나 끝났음", () => {
  expect(canWithdraw(row({ stage: "manager" }))).toBe(true);
  for (const stage of ["top", "approved", "rejected", "withdrawn", "revoked"] as const) expect(canWithdraw(row({ stage }))).toBe(false);
});

test("mineItem: 일반 사용자의 내 신청 — 번호는 분류 칸에, AI 칸 없음", () => {
  const it = mineItem(row({ stage: "top" }));
  expect(it).toMatchObject({ type: "mine", key: "mine:REQ-2026-0001", id: "", typeLabel: "REQ-2026-0001", who: "인사정보 조회", what: "—", judge: "최종 결재 대기" });
  expect(it.level).toBeUndefined();
  expect(mineItem(row({ reason: "업무" })).what).toBe("업무");
});

const access = (code: string, system: string | null, extra: Partial<AccessItem> = {}): AccessItem =>
  ({ code, name: `권한 ${code}`, system, category: null, description: null, is_active: true, updated_at: null, created_at: null, ...extra });
const mine = (access_code: string, stage: RequestRow["stage"], period_end: string | null = null): RequestRow =>
  ({ access_code, stage, period_end } as RequestRow);

const catalog = [access("A-1", "A"), access("A-2", "A"), access("B-1", "B"), access("OFF", "B", { is_active: false }), access("X-1", null)];
const held = [mine("A-1", "approved"), mine("A-2", "manager"), mine("OLD", "approved", "2000-01-01")];

test("시스템 순으로 늘어놓고(같은 시스템끼리 붙임) 꺼진 권한은 빼며, 시스템이 없으면 기타로 맨 뒤", () => {
  const o = accessOptions(catalog, held, "");
  expect(o.items.map((a) => a.code)).toEqual(["A-1", "A-2", "B-1", "X-1"]);
  expect(o.empty).toBe(false);
  expect(accessOptions([access("A-1", "A"), access("B-1", "B"), access("A-2", "A")], [], "").items.map((a) => a.code)).toEqual(["A-1", "A-2", "B-1"]);
});

test("보유 중 · 결재 중인 권한은 막고 이유를 적는다", () => {
  expect(accessOptions(catalog, held, "").reason).toEqual({ "A-1": "보유 중", "A-2": "결재 중" });
});

test("앞 선택은 막히지 않았을 때만 유지한다", () => {
  expect(accessOptions(catalog, held, "B-1").value).toBe("B-1");
  expect(accessOptions(catalog, held, "A-1").value).toBe("");
  expect(accessOptions(catalog, held, "").value).toBe("");
});

test("켜진 권한이 없으면 비었다고 알린다", () => {
  const o = accessOptions([access("OFF", "B", { is_active: false })], [], "");
  expect(o.empty).toBe(true);
  expect(o.items).toEqual([]);
});

const approval = { step: "manager", action: "approve", approver_name: "박운영", approver_department: "보안팀", decided_at: "2026-10-29T03:49:00+09:00", ai_level: "주의", comment: "확인했습니다" } as const;

test("결재 기록 — 단계 · 결정 · 이름 (부서) · 시각 · 그때 AI 판정 · 의견", () => {
  expect(approvalSteps(row({ approvals: [approval] }))).toEqual([
    { title: "1차 승인", who: "박운영 (보안팀)", when: "2026-10-29 03:49 · 그때 AI 판정 주의", say: "확인했습니다" },
  ]);
});

test("최종 반려와 회수는 기록 끝에 붙는다", () => {
  const steps = approvalSteps(row({
    approvals: [approval, { ...approval, step: "top", action: "reject", approver_department: null, comment: null }],
    revocation: { revoker_name: "최책임", revoker_department: null, revoked_at: "2026-10-30T09:00:00+09:00", reason: "퇴사" },
  }));
  expect(steps.map((s) => s.title)).toEqual(["1차 승인", "최종 반려", "회수"]);
  expect(steps[1].who).toBe("박운영");
  expect(steps[2]).toEqual({ title: "회수", who: "최책임", when: "2026-10-30 09:00", say: "퇴사" });
});

test("반려 의견 — 반려한 단계 · 결재자 · 의견, 의견이 없으면 그렇게 적음", () => {
  const finalReject = { ...approval, step: "top", action: "reject", comment: "인사팀장 승인이 필요합니다" } as const;
  expect(rejectNote(row({ stage: "rejected", approvals: [approval, finalReject] }))).toBe("최종 반려 · 박운영 (보안팀) — 인사팀장 승인이 필요합니다");
  expect(rejectNote(row({ stage: "rejected", approvals: [{ ...approval, action: "reject", comment: null }] }))).toBe("1차 반려 · 박운영 (보안팀) — 의견 없음");
  expect(rejectNote(row({ stage: "approved", approvals: [approval] }))).toBeUndefined();
});

test("내 신청 줄 — 반려된 신청에만 반려 의견을 단다", () => {
  const rejected = row({ stage: "rejected", approvals: [{ ...approval, action: "reject", comment: "사유 부족" }] });
  expect(mineItem(rejected).note).toBe("1차 반려 · 박운영 (보안팀) — 사유 부족");
  expect(mineItem(row({ stage: "manager" })).note).toBeUndefined();
});

test("보유 중 배지의 기간 — 올해면 월/일까지, 다른 해면 날짜 전체, 끝나는 날이 없으면 보유 중만", () => {
  expect(heldLabel(null, "2026-11-02")).toBe("보유 중");
  expect(heldLabel("2026-12-31", "2026-11-02")).toBe("보유 중 · 12/31까지");
  expect(heldLabel("2027-01-15", "2026-11-02")).toBe("보유 중 · 2027-01-15까지");
  expect(accessOptions([access("A-1", "A")], [mine("A-1", "approved", "2999-03-05")], "").reason["A-1"]).toBe("보유 중 · 2999-03-05까지");
});
