import { expect, test } from "vitest";
import { EMPTY_RESULTS } from "@/shared/api/queries";
import type { EventFinding, Results, ServerFinding } from "@/shared/api/types";
import { eventItems, policyItems, serverItems } from "./items";

const decision = { action: "approve", decider_name: "운영자", decided_at: "2026-10-29T04:00:00+09:00", comment: null, ai_level: "위험" };
const event = (p: Partial<EventFinding>): EventFinding =>
  ({ key: "k1", id: "abc@2026-10-20", title: "A 개발 박민수", level: "위험", reason: "퇴근 뒤 출력", recommendation: "확인", sources: [], ...p });
const server = (p: Partial<ServerFinding>): ServerFinding =>
  ({ key: "s1", id: "NODE-sim-01", title: "sim-01", level: "주의", reason: "요약", gaps: [], unjudged: [], ...p });

test("eventItems: 로그 줄 수 · 1차 판정 · 결정", () => {
  const r: Results = { ...EMPTY_RESULTS, events: [event({ detail: { events: "a\nb\n", last_event_at: "2026-10-20T18:30:00+09:00" }, stage: "fast" })], decisions: { event: { k1: decision } } };
  expect(eventItems(r)[0]).toMatchObject({
    type: "event", key: "event:k1", itemKey: "k1", id: "LOG-abc", level: "위험", judge: "위험",
    who: "A 개발 박민수", what: "로그 2건 — 퇴근 뒤 출력", when: "2026-10-20 18:30", sub: "1차 판정 · 확정 대기", decision,
  });
  expect(eventItems({ ...EMPTY_RESULTS, events: [event({ stage: "final" })] })[0]).toMatchObject({ what: "로그 0건 — 퇴근 뒤 출력", sub: "", decision: undefined });
});

test("serverItems: 다른 곳이 있으면 개수를 앞에", () => {
  const gap = { level: "위험" as const, item: "UFW", current: "inactive", required: "active", change: "ufw enable" };
  const r: Results = { ...EMPTY_RESULTS, servers: [server({ gaps: [gap, gap] }), server({ key: "s2", id: "NODE-x" })], sections: { servers: { source: "nodes", generated_at: "2026-10-29T03:00:00+09:00", load_issues: [] } } };
  const [a, b] = serverItems(r);
  expect(a).toMatchObject({ type: "server", key: "server:s1", itemKey: "s1", id: "NODE-sim-01", what: "정책과 다른 곳 2 — 요약", when: "2026-10-29 03:00", judge: "주의" });
  expect(b.what).toBe("요약");
});

test("policyItems: 번호 · 정책 쌍 · 유형", () => {
  const r: Results = { ...EMPTY_RESULTS, policy_review: { issues: [{ key: "p1", kind: "충돌", level: "위험", policy_ids: ["FW-004", "FW-005"], reason: "순서", recommendation: "r" }] },
    sections: { policies: { source: "data/policies", generated_at: "2026-10-29T03:00:00+09:00", load_issues: [] } } };
  expect(policyItems(r)[0]).toMatchObject({ type: "policy", key: "policy:p1", itemKey: "p1", id: "ISSUE-1", who: "FW-004 ↔ FW-005", what: "충돌 — 순서", when: "2026-10-29 03:00", judge: "위험" });
});

test("아무것도 돌리지 않은 서버는 세 목록이 모두 빈다", () => {
  expect(policyItems(EMPTY_RESULTS)).toEqual([]);
  expect(serverItems(EMPTY_RESULTS)).toEqual([]);
  expect(eventItems(EMPTY_RESULTS)).toEqual([]);
});
