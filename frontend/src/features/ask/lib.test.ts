import { expect, test } from "vitest";
import { askWaitLabel, criteriaText, stepText } from "./lib";

test("askWaitLabel: 경과 초", () => {
  expect(askWaitLabel(1000, 13400)).toBe("답변 생성 중… 12초");
  expect(askWaitLabel(5000, 5000)).toBe("답변 생성 중… 0초");
});

test("criteriaText: 조건 이름을 우리말로, 시각은 분 단위로", () => {
  expect(criteriaText({ user: "박민수", since: "2026-10-01T00:00:00+09:00", keyword: "Exception=1" })).toBe("사용자 박민수 · 부터 2026-10-01 00:00 · 항목 Exception=1");
  expect(criteriaText({ foo: "bar" })).toBe("foo bar");
  expect(criteriaText({})).toBe("조건 없음 (전체)");
  expect(criteriaText(null, "")).toBe("");
  expect(criteriaText({ kind: "events" })).toBe("종류 로그 감시");
});

test("stepText: 요약 · 조건, 실패는 도구 이름", () => {
  expect(stepText({ tool: "find_logs", args: {}, summary: "로그 48건", criteria: { user: "재무 정다은" } })).toBe("로그 48건 · 사용자 재무 정다은");
  expect(stepText({ tool: "servers", args: {}, summary: "서버 2대" })).toBe("서버 2대");
  expect(stepText({ tool: "person", args: {}, summary: "실패", error: "인자 오류" })).toBe("사람 · 실패");
});
