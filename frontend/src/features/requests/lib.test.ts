import { expect, test } from "vitest";
import type { RequestRow, AccessItem, Verdict } from "@/shared/api/types";
import { accessOptions, approvalFlow, canWithdraw, endedBreakdown, heldLabel, mineStatus, moveText, pageLinks, periodProblem, periodText, rejectNote, requestItem, shortDate } from "./lib";

const row = (p: Partial<RequestRow>): RequestRow => ({
  id: 1, request_no: "REQ-2026-0001", requester_id: 4, requester_name: "김민수", requester_department: "인사팀", requester_job: "",
  requested_access: "인사정보 조회", access_code: "HR_READ", current_access: "", reason: "", period_start: "", period_end: "",
  submitted_at: "2026-10-29T03:00:00+09:00", closed_at: null, stage: "manager", approvals: [], revocation: null, ...p,
});
const verdict = (p: Partial<Verdict>): Verdict => ({
  level: "위험", reason: "r", recommendation: "c", sources: [], failed: false, error: null, model: "m", elapsed_sec: 20,
  judged_at: "2026-10-29T03:01:00+09:00", grounding: {}, ...p,
});

test("requestItem: 판정 중 · 판정 대기 · 판정 실패 · 등급", () => {
  expect(requestItem(row({ judging: true })).judge).toBe("판정 중");
  expect(requestItem(row({})).judge).toBe("판정 대기");
  const failed = requestItem(row({ ai_verdict: verdict({ level: null, reason: "", recommendation: "", failed: true, error: "시간 초과" }) }));
  expect(failed.judge).toBe("판정 실패");
  expect(failed.level).toBeUndefined();
  const ok = requestItem(row({ ai_verdict: verdict({}) }));
  expect(ok).toMatchObject({ type: "req", key: "req:REQ-2026-0001", id: "REQ-2026-0001", level: "위험", judge: "위험", who: "인사팀 김민수", what: "인사정보 조회", when: "2026-10-29 03:00" });
});

test("requestItem: 상태 글자 — 기간이 끝난 승인은 따로", () => {
  expect(requestItem(row({ stage: "manager" })).sub).toBe("1차 결재 대기");
  expect(requestItem(row({ stage: "approved", period_end: "2000-01-01" })).sub).toBe("만료");
  expect(requestItem(row({ stage: "approved", period_end: "" })).sub).toBe("승인");
});

test("철회는 1차 결재를 기다리는 신청만 — 그 뒤에는 결재가 진행됐거나 끝났음", () => {
  expect(canWithdraw(row({ stage: "manager" }))).toBe(true);
  for (const stage of ["top", "approved", "rejected", "withdrawn", "revoked"] as const) expect(canWithdraw(row({ stage }))).toBe(false);
});


const access = (code: string, system: string, extra: Partial<AccessItem> = {}): AccessItem =>
  ({ id: 1, code, name: `권한 ${code}`, system, category: "", description: "", is_active: true, created_by: 1, updated_at: "", created_at: "", ...extra });
const mine = (access_code: string, stage: RequestRow["stage"], period_end: string | null = null): RequestRow =>
  ({ access_code, stage, period_end } as RequestRow);

const catalog = [access("A-1", "A"), access("A-2", "A"), access("B-1", "B"), access("OFF", "B", { is_active: false }), access("X-1", "")];
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

const approval = { step: "manager", action: "approve", approver_id: 7, approver_name: "박운영", approver_department: "보안팀", decided_at: "2026-10-29T03:49:00+09:00", ai_level: "주의", comment: "확인했습니다" } as const;

test("결재 단계 — 1차 승인 뒤 최종 결재 대기, 의견은 아래 줄", () => {
  const f = approvalFlow(row({ stage: "top", approvals: [approval] }));
  expect(f.steps).toEqual([
    { label: "신청 완료", who: "김민수", state: "done" },
    { label: "1차 승인", who: "박운영", state: "done" },
    { label: "최종 결재", who: "", state: "current" },
  ]);
  expect(f.notes).toEqual([{ label: "1차 의견", text: "확인했습니다", alert: false }]);
});

test("결재 단계 — 최종 반려 · 철회 · 회수 · 만료", () => {
  const reject = approvalFlow(row({ stage: "rejected", approvals: [approval, { ...approval, step: "top", action: "reject", comment: "" }] }));
  expect(reject.steps.map((s) => s.state)).toEqual(["done", "done", "rejected"]);
  expect(approvalFlow(row({ stage: "withdrawn" })).steps.map((s) => [s.label, s.state])).toEqual([["철회", "stopped"], ["1차 결재", "idle"], ["최종 결재", "idle"]]);
  const top = { ...approval, step: "top", comment: "" } as const;
  const revoked = approvalFlow(row({ stage: "revoked", approvals: [approval, top], revocation: { revoker_id: 9, revoker_name: "최책임", revoker_department: null, revoked_at: "2026-10-30T09:00:00+09:00", reason: "퇴사" } }));
  expect(revoked.notes.at(-1)).toEqual({ label: "회수", text: "퇴사 (최책임)", alert: true });
  const expired = approvalFlow(row({ stage: "approved", period_end: "2026-10-31", approvals: [approval, top] }), "2026-11-02");
  expect(expired.notes.at(-1)).toEqual({ label: "만료", text: "사용 기간 끝 2026-10-31", alert: true });
});

test("반려 의견 — 반려한 단계 · 결재자 · 의견, 의견이 없으면 그렇게 적음", () => {
  const finalReject = { ...approval, step: "top", action: "reject", comment: "인사팀장 승인이 필요합니다" } as const;
  expect(rejectNote(row({ stage: "rejected", approvals: [approval, finalReject] }))).toBe("최종 반려: 인사팀장 승인이 필요합니다");
  expect(rejectNote(row({ stage: "rejected", approvals: [{ ...approval, action: "reject", comment: "" }] }))).toBe("1차 반려: 의견 없음");
  expect(rejectNote(row({ stage: "approved", approvals: [approval] }))).toBeUndefined();
});

test("내 신청 줄 — 반려된 신청에만 반려 의견을 단다", () => {
  const rejected = row({ stage: "rejected", approvals: [{ ...approval, action: "reject", comment: "사유 부족" }] });
  expect(rejectNote(rejected)).toBe("1차 반려: 사유 부족");
  expect(rejectNote(row({ stage: "manager" }))).toBeUndefined();
});

test("보유 중 배지의 기간 — 올해면 월/일까지, 다른 해면 날짜 전체, 끝나는 날이 없으면 보유 중만", () => {
  expect(heldLabel(null, "2026-11-02")).toBe("보유 중");
  expect(heldLabel("2026-12-31", "2026-11-02")).toBe("보유 중 (12/31까지)");
  expect(heldLabel("2027-01-15", "2026-11-02")).toBe("보유 중 (2027-01-15까지)");
  expect(accessOptions([access("A-1", "A")], [mine("A-1", "approved", "2999-03-05")], "").reason["A-1"]).toBe("보유 중 (2999-03-05까지)");
});

test("내 신청 상태 글자 — 사용 중은 기간까지, 기간이 끝난 승인은 만료, 나머지는 단계 이름", () => {
  const on = "2026-11-02";
  expect(mineStatus(row({ stage: "approved", period_end: "2026-12-31" }), on)).toBe("12/31까지");
  expect(mineStatus(row({ stage: "approved", period_end: "" }), on)).toBe("사용 중");
  expect(mineStatus(row({ stage: "approved", period_end: "2026-10-31" }), on)).toBe("만료");
  expect(mineStatus(row({ stage: "manager" }), on)).toBe("1차 결재 대기");
  expect(mineStatus(row({ stage: "rejected" }), on)).toBe("반려");
});

test("짧은 날짜 — 올해면 월/일, 다른 해면 날짜 전체", () => {
  expect(shortDate("2026-12-31", "2026-11-02")).toBe("12/31");
  expect(shortDate("2027-01-05", "2026-11-02")).toBe("2027-01-05");
});

test("requestItem: 보유 권한 재검토 — 퇴사는 바로 위험, 이동은 판정 중 · 대기 · 등급", () => {
  const move = { id: 1, from_department: "보안팀", from_job: "보안 관제", to_department: "인사팀", to_job: "", moved_on: "2026-11-03" };
  const verdict = { level: "위험" as const, reason: "r", recommendation: "c", sources: [], failed: false, error: null, model: "", elapsed_sec: null,
    judged_at: null, by: "code" as const };
  const held = { stage: "approved" as const, period_end: "" };
  expect(requestItem(row({ ...held, grant_review: { cause: "leave", left_on: "2026-11-01", verdict } })).sub).toBe("퇴사 재검토 위험");
  expect(requestItem(row({ ...held, grant_review: { cause: "move", move, verdict: null, judging: true } })).sub).toBe("이동 재검토 판정 중");
  expect(requestItem(row({ ...held, grant_review: { cause: "move", move, verdict: null } })).sub).toBe("이동 재검토 판정 대기");
  expect(requestItem(row({ ...held, grant_review: { cause: "move", move, verdict: { ...verdict, level: "정상", by: "ai" } } })).sub).toBe("이동 재검토 정상");
  expect(moveText(move)).toBe("2026-11-03 보안팀(보안 관제) → 인사팀");
});

test("사용 기간 — 끝나는 날이나 기한 없음 중 하나, 끝이 시작보다 앞설 수 없음", () => {
  expect(periodProblem("", "", true)).toBeNull();
  expect(periodProblem("2026-11-20", "2026-11-01", true)).toBeNull();      // 기한 없음이면 종료일을 보내지 않습니다
  expect(periodProblem("", "", false)).toBe("사용 종료일을 고르거나 기한 없음을 누르세요");
  expect(periodProblem("2026-11-20", "2026-11-01", false)).toBe("사용 종료일이 시작일보다 앞섭니다");
  expect(periodProblem("", "2026-12-31", false)).toBeNull();
  expect(periodProblem("2026-11-20", "2026-11-20", false)).toBeNull();
});

test("내 신청 표의 기간 — 빈 종료일은 기한 없음", () => {
  expect(periodText({ period_start: "2026-11-01", period_end: "2026-12-31" })).toBe("2026-11-01 ~ 2026-12-31");
  expect(periodText({ period_start: "", period_end: "2026-12-31" })).toBe("2026-12-31까지");
  expect(periodText({ period_start: "2026-11-01", period_end: "" })).toBe("2026-11-01부터, 기한 없음");
  expect(periodText({ period_start: "", period_end: "" })).toBe("기한 없음");
});

test("반려, 만료 타일의 내역 — 0 이 아닌 것만, 결재 중 · 사용 중은 세지 않음", () => {
  const on = "2026-11-16";
  const rows = [row({ stage: "rejected" }), row({ stage: "rejected" }), row({ stage: "approved", period_end: "2026-10-31" }),
    row({ stage: "withdrawn" }), row({ stage: "manager" }), row({ stage: "approved", period_end: "" })];
  expect(endedBreakdown(rows, on)).toBe("반려 2, 만료 1, 철회 1");
  expect(endedBreakdown([row({ stage: "manager" })], on)).toBe("");
});

test("쪽 번호는 지금 쪽을 가운데 두고 5개까지", () => {
  expect(pageLinks(1, 1)).toEqual([1]);
  expect(pageLinks(1, 3)).toEqual([1, 2, 3]);
  expect(pageLinks(1, 12)).toEqual([1, 2, 3, 4, 5]);
  expect(pageLinks(6, 12)).toEqual([4, 5, 6, 7, 8]);
  expect(pageLinks(12, 12)).toEqual([8, 9, 10, 11, 12]);
});
