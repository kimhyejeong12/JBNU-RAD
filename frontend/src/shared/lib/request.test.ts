import { expect, test } from "vitest";
import { isActive, period, requester, stageGroup } from "./request";

test("isActive: 승인됐고 기간이 안 끝났으면 유효 (끝나는 날 포함)", () => {
  expect(isActive({ stage: "approved", period_end: "2026-10-29" }, "2026-10-29")).toBe(true);
  expect(isActive({ stage: "approved", period_end: "2026-10-28" }, "2026-10-29")).toBe(false);
  expect(isActive({ stage: "approved", period_end: "" }, "2026-10-29")).toBe(true);
  expect(isActive({ stage: "manager", period_end: "" }, "2026-10-29")).toBe(false);
});

test("period · requester 문구", () => {
  expect(period({ period_start: "2026-10-01", period_end: "" })).toBe("2026-10-01 ~ …");
  expect(period({ period_start: "", period_end: "" })).toBe("기간 없음");
  expect(requester({ requester_department: "인사팀", requester_name: "김민수" })).toBe("인사팀 김민수");
  expect(requester({ requester_department: "", requester_name: "김민수" })).toBe("김민수");
});

test("신청 상태 묶음 — 결재 중(1차 · 최종) · 사용 중(승인 · 기간 남음) · 끝난 것(반려 · 철회 · 회수 · 기간 끝남)", () => {
  const on = "2026-11-02";
  expect(stageGroup({ stage: "manager", period_end: "" }, on)).toBe("pending");
  expect(stageGroup({ stage: "top", period_end: "" }, on)).toBe("pending");
  expect(stageGroup({ stage: "approved", period_end: "" }, on)).toBe("active");
  expect(stageGroup({ stage: "approved", period_end: "2026-10-31" }, on)).toBe("done");
  for (const stage of ["rejected", "withdrawn", "revoked"] as const) expect(stageGroup({ stage, period_end: "" }, on)).toBe("done");
});
