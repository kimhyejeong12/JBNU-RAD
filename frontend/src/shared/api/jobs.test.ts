import { expect, test } from "vitest";
import type { Jobs } from "./types";
import { fastDone, jobsInterval, runButton, shouldRefresh } from "./jobs";

const idle = (finished_at: string): Jobs =>
  ({ running: null, kinds: { policies: "정책 관리 검토" }, fast: { every_min: 5, next_at: "", last: { events_fast: { finished_at } } } }) as Jobs;

test("runButton: 작업 정보가 없으면 실행 불가", () => {
  expect(runButton(null, "policies")).toEqual({ hidden: false, disabled: true, text: "분석 실행 불가" });
});

test("runButton: 도는 동안 이름 · (자동) · 진행", () => {
  const jobs = { running: "policies", auto: true, done: 3, total: 8, kinds: { policies: "정책 관리 검토" } } as Jobs;
  expect(runButton(jobs, "policies")).toEqual({ hidden: false, disabled: true, text: "정책 관리 검토(자동) 중… 3/8" });
  expect(runButton({ ...jobs, auto: false, total: 0 }, "policies").text).toBe("정책 관리 검토 중…");
});

test("runButton: 쉬면 '… 실행', 정책 관리가 아닌 메뉴에는 없음", () => {
  expect(runButton(idle("t"), "policies")).toEqual({ hidden: false, disabled: false, text: "정책 관리 검토 실행" });
  expect(runButton(idle("t"), "events").hidden).toBe(true);
  expect(runButton(idle("t"), null).hidden).toBe(true);
});

test("jobsInterval: 돌면 2초, 아니면 30초", () => {
  expect(jobsInterval({ running: "nodes" } as Jobs)).toBe(2000);
  expect(jobsInterval(idle("t"))).toBe(30000);
  expect(jobsInterval(undefined)).toBe(30000);
});

test("fastDone: 빠른 감시가 끝난 시각", () => {
  expect(fastDone(idle("2026-10-29T03:00:00"))).toBe("2026-10-29T03:00:00");
  expect(fastDone({ running: null, kinds: {} } as Jobs)).toBeNull();
  expect(fastDone(null)).toBeNull();
});

test("shouldRefresh: 작업이 끝났거나 빠른 감시가 끝났을 때만", () => {
  expect(shouldRefresh({ running: "nodes", kinds: {} } as Jobs, idle("t1"))).toBe(true);
  expect(shouldRefresh(idle("t1"), idle("t2"))).toBe(true);
  expect(shouldRefresh(idle("t1"), idle("t1"))).toBe(false);
  expect(shouldRefresh(idle("t1"), { ...idle("t2"), running: "policies" })).toBe(false);
});
