import { expect, test } from "vitest";
import { levelDot, levelText, markTone } from "./styles";

// 등급 · 막대 조각의 모양은 데이터 값으로 고릅니다. 시험 데이터에 없는 값도 빠짐없이 모양이 있어야 합니다.
test("등급 표가 모든 키를 덮음", () => {
  expect(Object.keys(levelDot).sort()).toEqual(["none", "위험", "정상", "주의"]);
  expect(Object.keys(markTone).sort()).toEqual(["기타", "위험", "정상", "주의"]);
  for (const v of [...Object.values(levelDot), ...Object.values(markTone), ...Object.values(levelText)]) expect(v).not.toBe("");
});
