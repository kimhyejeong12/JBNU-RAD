import { expect, test } from "vitest";
import { dataNeeds } from "./views";

test("일반 사용자는 내 신청과 권한 목록만 받고 운영자용 데이터는 받지 않는다", () => {
  expect(dataNeeds("user")).toEqual({ operator: false, requests: false, mine: true, users: false, catalog: true, results: false });
});

test("보안 운영자는 결재함 · 검토 결과를 받고 계정 · 권한 목록은 받지 않는다", () => {
  expect(dataNeeds("manager")).toEqual({ operator: true, requests: true, mine: false, users: false, catalog: false, results: true });
});

test("보안 총책임자는 전부 받는다 (내 신청만 빼고)", () => {
  expect(dataNeeds("top")).toEqual({ operator: true, requests: true, mine: false, users: true, catalog: true, results: true });
});
