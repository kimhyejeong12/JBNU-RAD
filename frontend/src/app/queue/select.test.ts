import { expect, test } from "vitest";
import type { QueueItem } from "./types";
import { firstKeyInView, inView, openRisks, viewCounts, visible } from "./select";

const item = (p: Record<string, unknown>): QueueItem =>
  ({ id: p.key, who: "", what: "", when: "", judge: "", raw: {}, ...p }) as unknown as QueueItem;

const reqPending = item({ type: "req", key: "req:1", level: "위험", who: "영업팀 김", raw: { stage: "manager", requested_access: "x" } });
const reqActive = item({ type: "req", key: "req:2", level: "정상", raw: { stage: "approved", period_end: null } });
const polOpen = item({ type: "policy", key: "policy:a", level: "위험", raw: { policy_ids: ["FW-001", "FW-002"] } });
const polDone = item({ type: "policy", key: "policy:b", level: "위험", decision: { action: "approve", decider_name: "x", decided_at: "", comment: null, ai_level: null }, raw: {} });
const evt = item({ type: "event", key: "event:c", level: "주의", raw: {} });
const items = [reqPending, reqActive, polOpen, polDone, evt];

test("inView: 결재 대기는 내 단계의 신청만", () => {
  expect(inView(reqPending, "requests", "pending", "manager")).toBe(true);
  expect(inView(reqPending, "requests", "pending", "top")).toBe(false);
  expect(inView(reqActive, "requests", "pending", "manager")).toBe(false);
});

test("inView: 유효 권한 · 전체", () => {
  expect(inView(reqActive, "requests", "active", "manager")).toBe(true);
  expect(inView(reqPending, "requests", "active", "manager")).toBe(false);
  expect(inView(reqPending, "requests", "all", "manager")).toBe(true);
  expect(inView(reqActive, "requests", "all", "manager")).toBe(true);
});

test("inView: 종류가 메뉴를 정한다", () => {
  expect(inView(polOpen, "policies", "pending", "manager")).toBe(true);
  expect(inView(polOpen, "events", "pending", "manager")).toBe(false);
  expect(inView(evt, "events", "pending", "manager")).toBe(true);
});

test("visible: 등급 거르기와 검색 (정책 ID 포함, 대소문자 무시)", () => {
  const base = { view: "policies" as const, stageFilter: "all" as const, role: "manager" as const, filter: "전체" as const, query: "" };
  expect(visible(items, base).map((i) => i.key)).toEqual(["policy:a", "policy:b"]);
  expect(visible(items, { ...base, query: "fw-001" }).map((i) => i.key)).toEqual(["policy:a"]);
  expect(visible([...items, item({ type: "policy", key: "policy:c", level: "주의", raw: {} })], { ...base, filter: "주의" }).map((i) => i.key)).toEqual(["policy:c"]);
});

test("openRisks: 내가 결재할 위험 신청 + 결정하지 않은 위험 판정", () => {
  expect(openRisks(items, "manager").map((i) => i.key)).toEqual(["req:1", "policy:a"]);
  expect(openRisks(items, "top").map((i) => i.key)).toEqual(["policy:a"]);
  expect(openRisks(items, "user")).toEqual([]);
});

test("viewCounts: 메뉴별 건수, 입력은 바꾸지 않는다", () => {
  const frozen = Object.freeze([...items]);
  expect(viewCounts(frozen, ["requests", "policies", "events", "qa"], "all", "manager")).toEqual({ requests: 2, policies: 2, events: 1 });
});

test("firstKeyInView", () => {
  expect(firstKeyInView(items, "policies", "pending", "manager")).toBe("policy:a");
  expect(firstKeyInView(items, "users", "pending", "manager")).toBeNull();
});
