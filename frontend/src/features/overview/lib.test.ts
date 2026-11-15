import { expect, test } from "vitest";
import { arcs, rateText, targetOf } from "./lib";

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
