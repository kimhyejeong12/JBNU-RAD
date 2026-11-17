import { expect, test } from "vitest";
import type { Regulation } from "@/shared/api/types";
import { chipLabel, clauseHead, clauseText } from "./clause";

const regs: Regulation[] = [
  { name: "접근권한_관리기준.md", content: "# 제목\n\n## 4. 등급\n\n### 4.1 정상\n본문1\n\n### 4.2 위험\n본문2\n", updated_at: "" },
];

test("clauseText: 조항 여러 개를 모두 자른다", () => {
  expect(clauseText("[접근권한_관리기준.md] 4.1, 4.2", regs))
    .toBe("접근권한_관리기준.md\n\n### 4.1 정상\n본문1\n\n### 4.2 위험\n본문2");
});

test("clauseText: 조항 번호가 없으면 문서 전문", () => {
  expect(clauseText("접근권한_관리기준.md", regs)).toBe(regs[0].content.trim());
});

test("clauseText: 모르는 문서", () => {
  expect(clauseText("없는문서.md 1.1", regs)).toBe("기준 문서 원문에서 이 근거를 찾을 수 없습니다.");
});

test("clauseHead: 문서 이름과 조항 제목 모두", () => {
  expect(clauseHead("[접근권한_관리기준.md] 4.1, 4.2", regs)).toEqual({ doc: "접근권한_관리기준", title: "4.1 정상, 4.2 위험" });
  expect(clauseHead("접근권한_관리기준.md", regs)).toBeNull();
  expect(clauseHead("없는문서.md 1.1", regs)).toBeNull();
});

test("chipLabel: 문서 이름과 조항 번호", () => {
  expect(chipLabel("[접근권한_관리기준.md] 4.1, 4.2", regs)).toBe("접근권한_관리기준 4.1, 4.2");
});
