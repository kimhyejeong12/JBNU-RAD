import type { Jobs, Results } from "@/shared/api/types";

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
