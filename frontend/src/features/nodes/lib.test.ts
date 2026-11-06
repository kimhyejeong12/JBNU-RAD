import { expect, test } from "vitest";
import type { NodeRow } from "@/shared/api/types";
import { nodeState, nodeStateTone } from "./lib";

const node = (p: Partial<NodeRow>): NodeRow => ({
  name: "sim-01", host: "sim-01", ip: "10.0.0.1", enabled: true, key_issued: true, stale: false, interval_min: 30,
  agent_version: "1", registered_at: null, last_seen_at: null, last_collected_at: "2026-10-29T04:00:00+09:00", level: null, ...p,
});

test("꺼짐 · 키 없음 · 끊김 · 기다리는 중 · 수집 중 순서로 본다", () => {
  expect(nodeState(node({ enabled: false, key_issued: false }))).toEqual(["off", "꺼짐", "수집, 점검 안 함"]);
  expect(nodeState(node({ key_issued: false, stale: true }))).toEqual(["wait", "키 없음", "키를 발급하세요"]);
  expect(nodeState(node({ stale: true }))).toEqual(["stale", "끊김", "90분 넘게 소식 없음"]);
  expect(nodeState(node({ last_collected_at: null }))).toEqual(["wait", "기다리는 중", "첫 수집 대기"]);
  expect(nodeState(node({}))).toEqual(["on", "수집 중", "30분마다"]);
  expect(nodeState(node({ interval_min: null }))[2]).toBe("?분마다");
});

test("노드 상태 글자색 표가 모든 상태를 덮음", () => {
  expect(Object.keys(nodeStateTone).sort()).toEqual(["off", "on", "stale", "wait"]);
});
