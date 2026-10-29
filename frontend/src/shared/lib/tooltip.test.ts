import { expect, test } from "vitest";
import { placeTip } from "./tooltip";

const r = { left: 100, top: 100, width: 50, height: 20, right: 150, bottom: 120 };

test("아래에 공간이 있으면 가운데 아래", () => {
  expect(placeTip(r, "bottom", 100, 40, 800, 600)).toEqual({ left: 75, top: 128 });
});

test("아래에 공간이 없으면 위로", () => {
  expect(placeTip(r, "bottom", 100, 40, 800, 150)).toEqual({ left: 75, top: 52 });
});

test("오른쪽 배치는 요소 오른쪽 + 10, 세로 가운데", () => {
  expect(placeTip(r, "right", 100, 40, 800, 600)).toEqual({ left: 160, top: 90 });
});

test("화면 밖으로 나가지 않게 8px 안쪽으로 막는다", () => {
  expect(placeTip({ ...r, left: 0, right: 10, width: 10 }, "bottom", 100, 40, 800, 600).left).toBe(8);
  expect(placeTip({ ...r, left: 790, right: 800, width: 10 }, "bottom", 100, 40, 800, 600).left).toBe(692);
});
