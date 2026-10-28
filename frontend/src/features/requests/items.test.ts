import { expect, test } from "vitest";
import type { RequestRow } from "@/shared/api/types";
import { mineItem, requestItem } from "./items";

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

test("mineItem: 일반 사용자의 내 신청 — 번호는 분류 칸에, AI 칸 없음", () => {
  const it = mineItem(row({ stage: "top" }));
  expect(it).toMatchObject({ type: "mine", key: "mine:REQ-2026-0001", id: "", typeLabel: "REQ-2026-0001", who: "인사정보 조회", what: "—", judge: "최종 결재 대기" });
  expect(it.level).toBeUndefined();
  expect(mineItem(row({ reason: "업무" })).what).toBe("업무");
});
