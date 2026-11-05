import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJSON, send } from "@/shared/api/http";
import { refreshResults } from "@/shared/api/jobs";
import type { QueueDetail } from "./lib";

// 작업이 돌 때만 자주 받습니다.
export function useQueueDetail() {
  return useQuery({
    queryKey: ["queue"],
    queryFn: () => getJSON<QueueDetail>("/api/queue"),
    refetchInterval: (q) => (q.state.data?.current ? 2000 : 10000),
  });
}

export function useClearQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => send<QueueDetail>("/api/queue/clear", {}),
    onSuccess: (d) => {
      qc.setQueryData(["queue"], d);
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      refreshResults(qc);
    },
    onError: (e) => alert(`작업 큐를 초기화하지 못했습니다: ${e.message}`),
  });
}
