import { expect, test } from "vitest";
import { scaleFor } from "./pageScale";

test("큰 화면 배율 — 1920px 까지는 그대로, 넓으면 비율만큼(최대 2배)", () => {
  expect(scaleFor(1280)).toBe(1);
  expect(scaleFor(1920)).toBe(1);
  expect(scaleFor(2560)).toBeCloseTo(1.333, 3);
  expect(scaleFor(3840)).toBe(2);
  expect(scaleFor(5120)).toBe(2);
});
