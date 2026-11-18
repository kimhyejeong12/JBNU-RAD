import { expect, test } from "vitest";
import { arcs, delta, deltaText, firstTodos, rateText, targetOf } from "./lib";

const area = (area: "policy" | "server" | "event" | "suspect" | "grant", 위험: number, 주의: number) => ({ area, label: area, 위험, 주의, failed: 0 });

test("arcs: 0 인 영역은 빼고 비율을 이어 붙임", () => {
  const out = arcs([area("policy", 0, 0), area("server", 1, 1), area("event", 2, 0), area("suspect", 0, 0), area("grant", 0, 0)]);
  expect(out.total).toBe(4);
  expect(out.arcs.map((a) => [a.area, a.value, a.start, a.end])).toEqual([["server", 2, 0, 0.5], ["event", 2, 0.5, 1]]);
  expect(arcs([area("policy", 0, 0)])).toEqual({ total: 0, arcs: [] });
});

test("targetOf: 영역마다 갈 곳", () => {
  expect(targetOf("event", "event_findings/3")).toEqual({ to: "queue", key: "event:event_findings/3", view: "events" });
  expect(targetOf("server", "node_findings/2")).toEqual({ to: "queue", key: "server:node_findings/2", view: "policies" });
  expect(targetOf("policy", "policy_issues/9")).toEqual({ to: "queue", key: "policy:policy_issues/9", view: "policies" });
  expect(targetOf("policy", "policy_reviews/4")).toEqual({ to: "view", view: "policies" });
  expect(targetOf("suspect", "suspect/account:7")).toEqual({ to: "suspect", key: "account:7" });
  expect(targetOf("grant", "grant/REQ-20261101-001")).toEqual({ to: "grant", no: "REQ-20261101-001" });
  expect(rateText(null)).toBe("—");
  expect(rateText(50)).toBe("50%");
});

test("delta: 어제 끝과 지금의 차이, 하루뿐이면 견주지 않음", () => {
  const day = (day: string, 위험: number, 주의: number) => ({ day, 위험, 주의 });
  const trend = [day("2026-11-14", 1, 4), day("2026-11-15", 3, 4), day("2026-11-16", 5, 2)];
  expect([delta(trend, "위험"), delta(trend, "주의")]).toEqual([2, -2]);
  expect(delta(trend.slice(2), "위험")).toBeNull();
  expect([deltaText(2), deltaText(-2), deltaText(0), deltaText(null)]).toEqual(["어제보다 +2", "어제보다 -2", "어제와 동일", "어제 기록 없음"]);
});

test("firstTodos: 영역마다 맨 앞 하나씩, 위험부터", () => {
  const todo = (item: string, level: "위험" | "주의") => ({ item, key: item, subject: item, level, task: item, why: "" });
  const b = { areas: [
    { area: "policy" as const, label: "정책 관리", todos: [todo("p1", "주의"), todo("p2", "위험")] },
    { area: "server" as const, label: "서버 점검", todos: [] },
    { area: "event" as const, label: "로그 감시", todos: [todo("e1", "위험")] },
    { area: "grant" as const, label: "보유 권한 재검토", todos: [todo("g1", "주의")] },
  ] };
  expect(firstTodos(b as never, 2).map((t) => [t.area, t.item])).toEqual([["event", "e1"], ["policy", "p1"]]);
});

