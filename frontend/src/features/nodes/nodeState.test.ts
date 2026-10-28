import { expect, test } from "vitest";
import type { NodeRow } from "@/shared/api/types";
import { nodeState } from "./nodeState";

const node = (p: Partial<NodeRow>): NodeRow => ({
  name: "sim-01", host: "sim-01", ip: "10.0.0.1", enabled: true, key_issued: true, stale: false, interval_min: 30,
  agent_version: "1", registered_at: null, last_seen_at: null, last_collected_at: "2026-10-29T04:00:00+09:00", level: null, ...p,
});

test("꺼짐 · 키 없음 · 끊김 · 기다리는 중 · 수집 중 순서로 본다", () => {
  expect(nodeState(node({ enabled: false, key_issued: false }))).toEqual(["off", "꺼짐", "보내도 받지 않고 주기 점검에서도 빠집니다"]);
  expect(nodeState(node({ key_issued: false, stale: true }))).toEqual(["wait", "키 없음", "손으로 넣은 수집뿐입니다. 키를 발급해 노드에 넣으면 직접 보낼 수 있습니다"]);
  expect(nodeState(node({ stale: true }))).toEqual(["stale", "끊김", "30분 간격인데 세 번 넘게 소식이 없습니다"]);
  expect(nodeState(node({ last_collected_at: null }))).toEqual(["wait", "기다리는 중", "키를 발급했지만 아직 받은 수집이 없습니다"]);
  expect(nodeState(node({}))).toEqual(["on", "수집 중", "30분마다"]);
  expect(nodeState(node({ interval_min: null }))[2]).toBe("?분마다");
});
