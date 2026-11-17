import { expect, test } from "vitest";
import { dayTime, niceMax, pct, person, points, stamp } from "./format";

test("points: 줄이 여럿이면 줄마다, 번호 떼고 소제목 따로", () => {
  expect(points("1. 직무 연관성: 연관성이 부족합니다.\n2. 사용 기간: 적당합니다.")).toEqual([
    { label: "직무 연관성", text: "연관성이 부족합니다." },
    { label: "사용 기간", text: "적당합니다." },
  ]);
});

test("points: 또한 · 그러나 처럼 잇는 문장은 앞 항목에 붙임", () => {
  expect(points("인사팀장 승인이 필요합니다. 또한, 기간이 없습니다. 최근 위협 기록은 없습니다.").map((p) => p.text)).toEqual([
    "인사팀장 승인이 필요합니다. 또한, 기간이 없습니다.",
    "최근 위협 기록은 없습니다.",
  ]);
});

test("points: 마크다운 굵게(**)는 걷어 냄", () => {
  expect(points("1. **최소 권한 위반**: 범위가 넓습니다.\n2. **정기 검토**: 필요합니다.")[0]).toEqual({ label: "최소 권한 위반", text: "범위가 넓습니다." });
});

test("points: 한 줄이면 문장마다, 조항 번호 · 시각에서는 안 나눔", () => {
  expect(points("기준 3.3 조항에 따라 주의로 판단됩니다. 10:30 접속은 근무 시간입니다.")).toEqual([
    { label: "", text: "기준 3.3 조항에 따라 주의로 판단됩니다." },
    { label: "", text: "10:30 접속은 근무 시간입니다." },
  ]);
});

test("stamp: 한국 시간 분 단위, 없으면 빈 문자열", () => {
  expect(stamp("2026-10-29T03:49:00+09:00")).toBe("2026-10-29 03:49");
  expect(stamp("2026-10-28T18:49:00Z")).toBe("2026-10-29 03:49");
  expect(stamp(null)).toBe("");
});

test("pct: 소수 한 자리, 분모가 0 이면 —", () => {
  expect(pct(1, 4)).toBe("25%");
  expect(pct(1, 3)).toBe("33.3%");
  expect(pct(1, 0)).toBe("—");
});

test("niceMax: 자릿수 단위로 올림", () => {
  expect(niceMax(37)).toBe(40);
  expect(niceMax(120)).toBe(200);
  expect(niceMax(0)).toBe(0);
});

test("person: 이름 뒤에 부서를 괄호로, 부서가 없으면 이름만", () => {
  expect(person("김민수", "보안팀")).toBe("김민수 (보안팀)");
  expect(person("김민수", null)).toBe("김민수");
  expect(person("김민수", "")).toBe("김민수");
});

test("dayTime: 올해면 연도를 빼고 날짜 · 시각을 나눔", () => {
  const now = new Date("2026-11-17T12:00:00+09:00");
  expect(dayTime("2026-11-17T20:12:00+09:00", now)).toEqual(["11-17", "20:12"]);
  expect(dayTime("2025-12-31T09:00:00+09:00", now)).toEqual(["2025-12-31", "09:00"]);
  expect(dayTime(null, now)).toEqual(["", ""]);
});
