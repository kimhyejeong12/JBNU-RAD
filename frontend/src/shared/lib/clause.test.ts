import { expect, test } from "vitest";
import type { PolicyRow, Regulation } from "@/shared/api/types";
import { chipLabel, clauseText, ruleIds, ruleText } from "./clause";

const regs: Regulation[] = [
  { name: "접근권한_관리기준.md", content: "# 제목\n\n## 4. 등급\n\n### 4.1 정상\n본문1\n\n### 4.2 위험\n본문2\n" },
];
const policy = (policy_id: string): PolicyRow =>
  ({ policy_id, solution: "FW", source: "ANY", destination: "DB", service: "3306", action: "ALLOW", expires_at: null }) as PolicyRow;

test("clauseText: 조항 여러 개를 모두 자른다", () => {
  expect(clauseText("[접근권한_관리기준.md] 4.1, 4.2", regs, []))
    .toBe("접근권한_관리기준.md\n\n### 4.1 정상\n본문1\n\n### 4.2 위험\n본문2");
});

test("clauseText: 조항 번호가 없으면 문서 전문", () => {
  expect(clauseText("접근권한_관리기준.md", regs, [])).toBe(regs[0].content.trim());
});

test("clauseText: 모르는 문서", () => {
  expect(clauseText("없는문서.md 1.1", regs, [])).toBe("기준 문서 원문에서 이 근거를 찾을 수 없습니다.");
});

test("ruleIds: 줄바꿈 없는 하이픈(U+2011)도 정책 ID 로 맞춘다", () => {
  expect(ruleIds("rules:policies.csv (FW‑002)", [policy("FW-002")])).toEqual(["FW-002"]);
});

test("ruleText: 정책이 없으면 안내 문구", () => {
  expect(ruleText("rules:x", [])).toBe("정책 관리 검토를 돌리면 솔루션 정책 원본이 여기에 표시됩니다.");
});

test("ruleText: 언급된 정책의 원본 행", () => {
  expect(ruleText("rules:policies.csv (FW-002)", [policy("FW-001"), policy("FW-002")]))
    .toBe("FW-002 [FW] ANY → DB · 3306 · ALLOW · 만료 없음");
});

test("chipLabel: 문서 이름과 조항 번호", () => {
  expect(chipLabel("[접근권한_관리기준.md] 4.1, 4.2", regs, [])).toBe("접근권한_관리기준 · 4.1, 4.2");
});

test("chipLabel: 솔루션 정책", () => {
  expect(chipLabel("rules:policies.csv (FW-001)", regs, [policy("FW-001")])).toBe("솔루션 정책 · FW-001");
  expect(chipLabel("rules:policies.csv", regs, [])).toBe("솔루션 정책");
});
