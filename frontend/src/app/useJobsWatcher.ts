import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { jobsQuery } from "@/shared/api/queries";
import { refreshResults, shouldRefresh } from "@/shared/api/jobs";
import type { Jobs } from "@/shared/api/types";

// 작업 폴링을 지켜보다가 작업이 끝나거나 빠른 감시가 끝나면 저장된 결과를 다시 받습니다.
// 첫 값은 비교하지 않고, 같은 값이 다시 오면(StrictMode 두 번 마운트) 아무것도 하지 않습니다.
export function useJobsWatcher(enabled: boolean): void {
  const qc = useQueryClient();
  const jobs = useQuery({ ...jobsQuery(), enabled });
  const prev = useRef<Jobs | undefined>(undefined);
  useEffect(() => {
    const next = jobs.data;
    if (!next) return;
    if (prev.current !== undefined && prev.current !== next && shouldRefresh(prev.current, next)) refreshResults(qc);
    prev.current = next;
  }, [jobs.data, qc]);
}
