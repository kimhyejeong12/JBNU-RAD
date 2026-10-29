import { expect, test } from "vitest";
import { niceMax, pct, person, stamp } from "./format";

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
