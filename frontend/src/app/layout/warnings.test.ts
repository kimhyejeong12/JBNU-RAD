import { expect, test } from "vitest";
import type { Health, Jobs } from "@/shared/api/types";
import { engineProblems, footerWarnings } from "./warnings";
import { EMPTY_RESULTS } from "@/shared/api/queries";

const ok: Health = { base_url: "http://ollama:11434", error: null, ok: true, connected: true, model: "qwen3:14b", model_ready: true, qa_model: "qwen3:14b", qa_model_ready: true, embedding_model: "e", embedding_ready: true, index_ready: true };

test("엔진 상태를 못 받으면 한 줄", () => {
  expect(engineProblems(null)).toEqual(["서버에서 엔진 상태를 받지 못했습니다"]);
});

test("연결이 끊기면 모델 이야기는 하지 않는다", () => {
  expect(engineProblems({ ...ok, connected: false, model_ready: false })).toEqual(["Ollama 서버 연결 끊김"]);
});

test("모델 · 인덱스 문제를 차례로", () => {
  expect(engineProblems({ ...ok, model_ready: false, index_ready: false })).toEqual(["판정 모델 없음 (qwen3:14b)", "기준 문서 인덱스 비어 있음"]);
  expect(engineProblems({ ...ok, qa_model_ready: false, embedding_ready: false })).toEqual(["질답 모델 없음 (qwen3:14b)", "임베딩 모델 없음 (e)"]);
});

test("문제가 없으면 경고가 없다", () => {
  expect(footerWarnings(EMPTY_RESULTS, null)).toEqual([]);
});

test("판정 실패 · 읽기 문제 · 작업 실패를 차례로", () => {
  const results = {
    ...EMPTY_RESULTS,
    summary: { ...EMPTY_RESULTS.summary, failed: 2 },
    sections: { policies: { source: "data/policies", generated_at: "2026-10-29T03:00:00+09:00", load_issues: ["x", "y"] }, events: null },
  };
  const last = (error: string | null) => ({ finished_at: "2026-10-29T03:00:00+09:00", error, auto: true });
  const jobs: Jobs = { running: null, auto: false, done: 0, total: 0, started_at: null, queued: false, waiting: [],
    kinds: { nodes: "서버 점검" }, last: { nodes: last("e"), policies: last(null) } };
  expect(footerWarnings(results, jobs)).toEqual([
    "판정 실패 2건 — 해당 건은 '주의'로 기록되었습니다. 수동 검토가 필요합니다",
    "data/policies 읽기 문제 2건 — x",
    "서버 점검 실패 — e",
  ]);
});
