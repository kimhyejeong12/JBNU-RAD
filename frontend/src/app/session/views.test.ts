import { expect, test } from "vitest";
import { ROLE_VIEWS, dataNeeds, defaultNavWide, isAdminView, navGroups, restorable } from "./views";

test("일반 사용자는 내 신청과 권한 목록만 받고 운영자용 데이터는 받지 않는다", () => {
  expect(dataNeeds("user")).toEqual({ operator: false, requests: false, mine: true, users: false, catalog: true, results: false });
});

test("보안 운영자는 결재함 · 검토 결과를 받고 계정 · 권한 목록은 받지 않는다", () => {
  expect(dataNeeds("manager")).toEqual({ operator: true, requests: true, mine: false, users: false, catalog: false, results: true });
});

test("보안 총책임자는 전부 받는다 (내 신청만 빼고)", () => {
  expect(dataNeeds("top")).toEqual({ operator: true, requests: true, mine: false, users: true, catalog: true, results: true });
});

test("사이드바 구역 — 역할 메뉴 순서대로 묶고, 관리 메뉴는 구역 대신 [관리] 하나로 뺀다", () => {
  const groups = [["결재", ["requests"]], ["보안 운영", ["policies", "events", "stats", "qa"]]];
  expect(navGroups(ROLE_VIEWS.manager)).toEqual(groups);
  expect(navGroups(ROLE_VIEWS.top)).toEqual(groups);
  expect(ROLE_VIEWS.top.filter(isAdminView)).toEqual(["access", "users", "docs", "jobs"]);
});

test("사이드바 처음 모양 — 1440px 이상은 펼치고, 그보다 좁으면 접는다", () => {
  expect(defaultNavWide(1440)).toBe(true);
  expect(defaultNavWide(1920)).toBe(true);
  expect(defaultNavWide(1439)).toBe(false);
});

test("새로고침 뒤 마지막 화면 — 이 역할에 있는 메뉴 · 탭만 쓰고, 없으면 null 이나 첫 탭", () => {
  expect(restorable({ view: "policies", mainTab: "nodes", stageFilter: "active", lastAdmin: null }, "manager"))
    .toEqual({ view: "policies", mainTab: "nodes", stageFilter: "active", lastAdmin: null });
  expect(restorable({ view: "users", mainTab: "queue" }, "manager")).toBeNull();
  expect(restorable("망가진 값", "top")).toBeNull();
  expect(restorable(null, "top")).toBeNull();
  expect(restorable({ view: "requests", mainTab: "nodes", stageFilter: "x", lastAdmin: "policies" }, "top"))
    .toEqual({ view: "requests", mainTab: "queue", stageFilter: "pending", lastAdmin: null });
  expect(restorable({ view: "events", mainTab: "logs", lastAdmin: "docs" }, "top")).toMatchObject({ mainTab: "logs", lastAdmin: "docs" });
});
