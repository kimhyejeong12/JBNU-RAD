import { expect, test } from "vitest";
import { askMode, askWaitLabel, criteriaText, serverCriteriaText } from "./lib";

test("askMode: 질의 탭은 메뉴를 따른다", () => {
  expect(askMode("qa")).toBe("policy");
  expect(askMode("policies")).toBe("servers");
  expect(askMode("events")).toBe("logs");
  expect(askMode(null)).toBe("policy");
});

test("askWaitLabel: 경과 초", () => {
  expect(askWaitLabel(1000, 13400)).toBe("답변 생성 중… 12초");
  expect(askWaitLabel(5000, 5000)).toBe("답변 생성 중… 0초");
});

test("criteriaText: 조건 이름을 우리말로, 시각은 분 단위로", () => {
  expect(criteriaText({ user: "박민수", since: "2026-10-01T00:00:00+09:00", keyword: "Exception=1" })).toBe("사용자 박민수 · 부터 2026-10-01 00:00 · 항목 Exception=1");
  expect(criteriaText({ foo: "bar" })).toBe("foo bar");
  expect(criteriaText({})).toBe("조건 없음 (전체 로그)");
  expect(criteriaText(null)).toBe("조건 없음 (전체 로그)");
});

test("serverCriteriaText: 서버 질의는 '모든 서버 · 전체 기록'", () => {
  expect(serverCriteriaText({})).toBe("조건 없음 (모든 서버 · 전체 기록)");
  expect(serverCriteriaText({ nodes: "sim-01", module: "ufw" })).toBe("노드 sim-01 · 모듈 ufw");
});
