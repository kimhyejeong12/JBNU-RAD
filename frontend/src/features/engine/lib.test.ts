import { expect, test } from "vitest";
import { jobRows, jobTarget, progress, waitingCount, type QueueJob } from "./lib";

const job = (p: Partial<QueueJob>): QueueJob => ({
  id: 1, kind: "events", key: "events:재무 정다은", status: "waiting", auto: true, created_at: "2026-11-05T15:00:00",
  started_at: null, lane: 2, close: false, batch: null, ...p,
});

test("잡 key 에서 대상을 읽음", () => {
  expect(jobTarget(job({}))).toBe("재무 정다은");
  expect(jobTarget(job({ kind: "request", key: "REQ-20261105-001", lane: 0 }))).toBe("REQ-20261105-001");
  expect(jobTarget(job({ kind: "grant", key: "grant:REQ-20261105-001:7" }))).toBe("REQ-20261105-001 (이동 7)");
  expect(jobTarget(job({ kind: "suspects", key: "suspects:account:3" }))).toBe("account:3");
  expect(jobTarget(job({ kind: "index", key: "index:2" }))).toBe("기준 문서");
  expect(jobTarget(job({ key: "events:close", close: true }))).toBe("저장");
});

test("기다리는 수 · 묶음 진행 · 마지막 실행 순서", () => {
  expect(waitingCount({ lanes: [{ lane: 0, name: "", jobs: [job({})] }, { lane: 2, name: "", jobs: [job({}), job({})] }] })).toBe(3);
  const batches = [{ id: 9, kind: "events", status: "running", auto: true, done: 2, total: 5, created_at: "", started_at: null }];
  expect(progress({ batches }, job({ batch: 9 }))).toBe("2/5");
  expect(progress({ batches }, job({ kind: "request" }))).toBe("");
  const done = (at: string) => ({ finished_at: at, error: null, auto: true });
  const last = { index: done("2026-11-05T09:00:00"), policies: done("2026-11-05T12:00:00"), events: done("2026-11-05T11:00:00") };
  const schedule = { events: { every_min: 30, next_at: "2026-11-05T11:30:00" }, nodes: { every_min: 30, next_at: "2026-11-05T11:30:00" } };
  // 예약된 것은 서버 순서, 그 밖은 늦게 끝난 것부터 — 예약과 마지막 실행이 한 줄에 모임
  expect(jobRows({ schedule, last }).map((r) => [r.kind, r.everyMin, r.last?.finished_at ?? null])).toEqual([
    ["events", 30, "2026-11-05T11:00:00"], ["nodes", 30, null], ["policies", null, "2026-11-05T12:00:00"], ["index", null, "2026-11-05T09:00:00"],
  ]);
});
