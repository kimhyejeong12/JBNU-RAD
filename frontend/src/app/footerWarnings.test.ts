import { expect, test } from "vitest";
import { EMPTY_RESULTS } from "@/shared/api/queries";
import type { Jobs } from "@/shared/api/types";
import { footerWarnings } from "./footerWarnings";

test("문제가 없으면 경고가 없다", () => {
  expect(footerWarnings(EMPTY_RESULTS, null)).toEqual([]);
});

test("판정 실패 · 읽기 문제 · 작업 실패를 차례로", () => {
  const results = {
    ...EMPTY_RESULTS,
    summary: { failed: 2 },
    sections: { policies: { source: "data/policies", generated_at: null, load_issues: ["x", "y"] }, events: null },
  };
  const jobs = { running: null, kinds: { nodes: "서버 점검" }, last: { nodes: { error: "e" }, policies: { error: null } } } as Jobs;
  expect(footerWarnings(results, jobs)).toEqual([
    "판정 실패 2건 — 해당 건은 '주의'로 기록되었습니다. 수동 검토가 필요합니다",
    "data/policies 읽기 문제 2건 — x",
    "서버 점검 실패 — e",
  ]);
});
