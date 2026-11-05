import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getJSON, send } from "./http";
import type { JobKind, Jobs } from "./types";

const VIEW_KIND: Record<string, JobKind> = { policies: "policies" };

// 두 번 누르면 두 번째가 409 를 받으므로 시작 요청이 가는 동안(pending) 막습니다.
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

export function busyJob(jobs: Jobs | null | undefined): string | null {
  const kind = jobs?.running || jobs?.fast?.running;
  return kind ? jobs?.kinds[kind] || kind : null;
}

export const jobsInterval = (jobs: Jobs | null | undefined): 2000 | 30000 => (jobs?.running ? 2000 : 30000);

// 빠른 로그 감시는 따로 돌아 running 에 나오지 않습니다.
export const fastDone = (jobs: Jobs | null | undefined): string | null => jobs?.fast?.last?.events_fast?.finished_at ?? null;

// 두 폴링 사이에 시작해서 끝난 작업도 마지막 실행 시각이 바뀌어 알 수 있습니다.
const finishedStamps = (jobs: Jobs | null | undefined): string =>
  Object.entries(jobs?.last ?? {}).map(([kind, last]) => `${kind}=${last.finished_at ?? ""}`).sort().join(" ");

export const shouldRefresh = (prev: Jobs | null | undefined, next: Jobs): boolean =>
  !next.running && (!!prev?.running || fastDone(prev) !== fastDone(next) || finishedStamps(prev) !== finishedStamps(next));

export function refreshResults(qc: QueryClient): void {
  for (const queryKey of [["results"], ["nodes"], ["stats"]]) qc.invalidateQueries({ queryKey });
}

export function useStartJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: JobKind) => getJSON<Jobs>(`/api/jobs/${kind}`, { method: "POST" }),
    // 시작하자마자 끝난 작업도 결과를 보여주도록 running 이 없으면 바로 갱신합니다.
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

export function useResetJobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rerun: boolean) => send<Jobs>("/api/jobs/reset", { rerun }),
    onSuccess: (jobs) => {
      qc.setQueryData(["jobs"], jobs);
      refreshResults(qc);
    },
    onError: (e) => alert(`작업을 끝내지 못했습니다: ${e.message}`),
  });
}
