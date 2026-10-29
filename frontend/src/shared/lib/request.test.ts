import { expect, test } from "vitest";
import { isActive, period, requester } from "./request";

test("isActive: 승인됐고 기간이 안 끝났으면 유효 (끝나는 날 포함)", () => {
  expect(isActive({ stage: "approved", period_end: "2026-10-29" }, "2026-10-29")).toBe(true);
  expect(isActive({ stage: "approved", period_end: "2026-10-28" }, "2026-10-29")).toBe(false);
  expect(isActive({ stage: "approved", period_end: null }, "2026-10-29")).toBe(true);
  expect(isActive({ stage: "manager", period_end: null }, "2026-10-29")).toBe(false);
});

test("period · requester 문구", () => {
  expect(period({ period_start: "2026-10-01", period_end: null })).toBe("2026-10-01 ~ …");
  expect(period({ period_start: null, period_end: null })).toBe("기간 없음");
  expect(requester({ requester_department: "인사팀", requester_name: "김민수" })).toBe("인사팀 김민수");
  expect(requester({ requester_department: "", requester_name: "김민수" })).toBe("김민수");
});
