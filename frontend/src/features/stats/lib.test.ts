import { expect, test } from "vitest";
import type { Stats, Suspect, UserStats } from "@/shared/api/types";
import { mergeDays, nodeLines, periodVerdicts, pickNodes, safetyTone, scoreDelta, suspectRows, trendMark } from "./lib";

test("trendMark: 직전보다 10점 넘게 오르내리면 화살표", () => {
  expect(trendMark([{ at: "a", score: 50 }, { at: "b", score: 61 }])).toBe(" ▲11");
  expect(trendMark([{ at: "a", score: 50 }, { at: "b", score: 39 }])).toBe(" ▼11");
  expect(trendMark([{ at: "a", score: 50 }, { at: "b", score: 60 }])).toBe("");
  expect(trendMark([{ at: "a", score: 50 }])).toBe("");
  expect(trendMark(undefined)).toBe("");
});

test("safetyTone: 80 이상 정상 · 50 이상 주의 · 그 아래 위험", () => {
  expect(safetyTone(80)).toBe("정상");
  expect(safetyTone(79)).toBe("주의");
  expect(safetyTone(50)).toBe("주의");
  expect(safetyTone(49)).toBe("위험");
});


test("mergeDays: 로그 날짜와 판정 날짜를 합쳐 날짜순으로", () => {
  const { keys, byDay } = mergeDays({ "2026-10-02": 5, "2026-10-01": 2 }, [{ day: "2026-10-02", "주의": 1, "위험": 0 }, { day: "2026-10-03", "주의": 0, "위험": 2 }]);
  expect(keys).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  expect(byDay["2026-10-01"]).toEqual({ "위험": 0, "주의": 0, total: 2 });
  expect(byDay["2026-10-02"]).toEqual({ "위험": 0, "주의": 1, total: 5 });
  expect(byDay["2026-10-03"]).toEqual({ "위험": 2, "주의": 0, total: 0 });
});

test("scoreDelta: 첫 날보다 몇 점, 이틀 미만이면 안내", () => {
  expect(scoreDelta([{ day: "2026-11-13", score: 56 }, { day: "2026-11-18", score: 44 }])).toBe("11-13보다 ▼12점");
  expect(scoreDelta([{ day: "2026-11-13", score: 40 }, { day: "2026-11-18", score: 52 }])).toBe("11-13보다 ▲12점");
  expect(scoreDelta([{ day: "2026-11-13", score: 50 }, { day: "2026-11-18", score: 50 }])).toBe("11-13부터 변화 없음");
  expect(scoreDelta([{ day: "2026-11-18", score: 50 }])).toBe("흐름은 이틀 이상 쌓이면 보입니다");
});

const person = (key: string, level: Suspect["level"], log_id = "", failed = false) => ({ key, level, log_id, failed }) as Suspect;

test("suspectRows: 고른 타일로 거름 — 등급, 위협 사용자는 로그 사용자 ID 로", () => {
  const d = { suspects: [person("a", "높음", "u1"), person("b", "보통", "u2"), person("c", null, "u3", true)],
    events: { users: [{ log_id: "u2" }] } } as unknown as UserStats;
  expect(suspectRows(d, null).map((p) => p.key)).toEqual(["a", "b", "c"]);
  expect(suspectRows(d, "높음").map((p) => p.key)).toEqual(["a"]);
  expect(suspectRows(d, "events").map((p) => p.key)).toEqual(["b"]);
});

test("periodVerdicts: 고른 기간 안 로그 감시 판정, 없으면 빈 글", () => {
  const d = { events: { users: [{ log_id: "u1", "위험": 1, "주의": 2 }, { log_id: "u2", "위험": 0, "주의": 1 }] } } as unknown as UserStats;
  expect(periodVerdicts(d, person("a", "높음", "u1"))).toBe("위험 1, 주의 2");
  expect(periodVerdicts(d, person("b", "보통", "u2"))).toBe("주의 1");
  expect(periodVerdicts(d, person("c", "보통", "u3"))).toBe("");
  expect(periodVerdicts(d, person("d", "보통"))).toBe("");
});

test("nodeLines: 켜 둔 노드와 기간 안 점검을 합치고 타일로 거름", () => {
  const d = {
    safety: { score: 50, trend: [], items: [{ node: "a", level: "위험", stale: false }, { node: "b", level: null, stale: false }, { node: "c", level: "정상", stale: true }] },
    servers: { nodes: [{ node: "a", level: "주의" }, { node: "d", level: "주의" }] },
  } as unknown as Stats;
  const lines = nodeLines(d);
  expect(lines.map((l) => [l.node, l.level, !!l.stat])).toEqual([["a", "위험", true], ["b", null, false], ["c", "정상", false], ["d", "주의", true]]);
  expect(pickNodes(lines, "위험").map((l) => l.node)).toEqual(["a"]);
  expect(pickNodes(lines, "주의").map((l) => l.node)).toEqual(["d"]);
  expect(pickNodes(lines, "none").map((l) => l.node)).toEqual(["b", "c"]);
});
