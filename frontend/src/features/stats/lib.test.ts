import { expect, test } from "vitest";
import { mergeDays, periodDays, safetyTone, trendMark } from "./lib";

test("trendMark: 직전보다 10점 넘게 오르내리면 화살표", () => {
  expect(trendMark([{ at: "a", score: 50 }, { at: "b", score: 61 }])).toBe(" · ▲11");
  expect(trendMark([{ at: "a", score: 50 }, { at: "b", score: 39 }])).toBe(" · ▼11");
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

test("periodDays: 기간별 날수, 전체는 첫 로그 날부터", () => {
  expect(periodDays("week", {})).toBe(7);
  expect(periodDays("month", {})).toBe(30);
  expect(periodDays("quarter", {})).toBe(90);
  expect(periodDays("all", { "2026-10-20": 3, "2026-10-25": 1 }, new Date("2026-10-29T00:00:00Z").getTime())).toBe(9);
  expect(periodDays("all", {})).toBe(0);
});

test("mergeDays: 로그 날짜와 판정 날짜를 합쳐 날짜순으로", () => {
  const { keys, byDay } = mergeDays({ "2026-10-02": 5, "2026-10-01": 2 }, [{ day: "2026-10-02", "주의": 1, "위험": 0 }, { day: "2026-10-03", "주의": 0, "위험": 2 }]);
  expect(keys).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  expect(byDay["2026-10-01"]).toEqual({ "위험": 0, "주의": 0, total: 2 });
  expect(byDay["2026-10-02"]).toEqual({ "위험": 0, "주의": 1, total: 5 });
  expect(byDay["2026-10-03"]).toEqual({ "위험": 2, "주의": 0, total: 0 });
});
