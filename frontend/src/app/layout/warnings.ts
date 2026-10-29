import type { Health, Jobs, Results } from "@/shared/api/types";

// 헤더 경고의 원인 — 정상일 때는 아무것도 띄우지 않고, 문제가 있을 때만 알립니다.
export function engineProblems(h: Health | null | undefined): string[] {
  if (!h) return ["서버에서 엔진 상태를 받지 못했습니다"];
  const out: string[] = [];
  if (!h.connected) out.push("Ollama 서버 연결 끊김");
  else {
    if (!h.model_ready) out.push(`판정 모델 없음 (${h.model})`);
    if (!h.qa_model_ready) out.push(`질답 모델 없음 (${h.qa_model})`);
    if (!h.embedding_ready) out.push(`임베딩 모델 없음 (${h.embedding_model})`);
  }
  if (!h.index_ready) out.push("기준 문서 인덱스 비어 있음");
  return out;
}

// 판정 실패 · 읽지 못한 행 · 작업 실패는 문제가 있을 때만 알립니다.
export function footerWarnings(r: Results, jobs: Jobs | null | undefined): string[] {
  const warns: string[] = [];
  if (r.summary.failed) warns.push(`판정 실패 ${r.summary.failed}건 — 해당 건은 '주의'로 기록되었습니다. 수동 검토가 필요합니다`);
  for (const sec of Object.values(r.sections || {})) {
    if (sec && sec.load_issues.length) warns.push(`${sec.source} 읽기 문제 ${sec.load_issues.length}건 — ${sec.load_issues[0]}`);
  }
  for (const [kind, last] of Object.entries(jobs?.last || {})) {
    if (last.error) warns.push(`${jobs?.kinds[kind]} 실패 — ${last.error}`);
  }
  return warns;
}
