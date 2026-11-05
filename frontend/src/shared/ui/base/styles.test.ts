import { expect, test } from "vitest";
import { levelDot, levelText, markTone } from "./styles";

test("등급 표가 모든 키를 덮음", () => {
  expect(Object.keys(levelDot).sort()).toEqual(["none", "위험", "정상", "주의"]);
  expect(Object.keys(markTone).sort()).toEqual(["기타", "위험", "정상", "주의"]);
  for (const v of [...Object.values(levelDot), ...Object.values(markTone), ...Object.values(levelText)]) expect(v).not.toBe("");
});
