import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getJSON } from "./http";
import type { JobKind, Jobs } from "./types";

// 분석 실행은 정책 관리만 합니다. 권한 신청은 들어오면 바로 판정되고, 로그 감시는 서버가 스스로 돌립니다.
const VIEW_KIND: Record<string, JobKind> = { policies: "policies" };

// pending 은 시작 요청이 가는 동안 — 두 번 누르면 두 번째가 409 를 받아 오류 창이 뜨므로 막습니다.
export function runButton(jobs: Jobs | null | undefined, view: string | null, pending = false): { hidden: boolean; disabled: boolean; text: string } {
  const kind = view ? VIEW_KIND[view] : undefined;
  if (!kind) return { hidden: true, disabled: true, text: "" };
  if (!jobs) return { hidden: false, disabled: true, text: "분석 실행 불가" };
  if (pending) return { hidden: false, disabled: true, text: `${jobs.kinds[kind] || "분석"} 실행` };
  if (jobs.running) {
    const name = jobs.kinds[jobs.running] || jobs.running;
    return { hidden: false, disabled: true, text: `${name}${jobs.auto ? "(자동)" : ""} 중…${jobs.total ? ` ${jobs.done}/${jobs.total}` : ""}` };
  }
  return { hidden: false, disabled: false, text: `${jobs.kinds[kind] || "분석"} 실행` };
}

export const runKindLabel = (jobs: Jobs | null | undefined, view: string): string =>
  `${(jobs && jobs.kinds[VIEW_KIND[view]]) || "분석"} 실행`;

export const jobsInterval = (jobs: Jobs | null | undefined): 2000 | 30000 => (jobs?.running ? 2000 : 30000);

// 빠른 로그 감시는 따로 돌아 running 에 나오지 않습니다. 끝난 시각이 바뀌면 결과를 다시 받습니다.
export const fastDone = (jobs: Jobs | null | undefined): string | null => jobs?.fast?.last?.events_fast?.finished_at ?? null;

// 작업별 마지막 실행 시각 — 두 폴링 사이에 시작해서 끝난 작업(뒤에 둔 탭 · 짧은 작업)도 이것이 바뀌어 알 수 있습니다.
const finishedStamps = (jobs: Jobs | null | undefined): string =>
  Object.entries(jobs?.last ?? {}).map(([kind, last]) => `${kind}=${last.finished_at ?? ""}`).sort().join(" ");

export const shouldRefresh = (prev: Jobs | null | undefined, next: Jobs): boolean =>
  !next.running && (!!prev?.running || fastDone(prev) !== fastDone(next) || finishedStamps(prev) !== finishedStamps(next));

// 작업이 끝나면 저장된 결과를 다시 받습니다. 활성 쿼리만 다시 받으므로 열려 있는 탭의 것만 갱신됩니다.
export function refreshResults(qc: QueryClient): void {
  for (const queryKey of [["results"], ["nodes"], ["stats"]]) qc.invalidateQueries({ queryKey });
}

export function useStartJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: JobKind) => getJSON<Jobs>(`/api/jobs/${kind}`, { method: "POST" }),
    // 파일이 없을 때처럼 시작하자마자 끝난 작업도 결과 · 실패를 보여줘야 하므로 running 이 없으면 바로 갱신합니다.
    onSuccess: (jobs) => {
      qc.setQueryData(["jobs"], jobs);
      if (!jobs.running) refreshResults(qc);
    },
    onError: (e) => {
      alert(`분석을 시작하지 못했습니다: ${e.message}`);
      refreshResults(qc);
    },
  });
}
