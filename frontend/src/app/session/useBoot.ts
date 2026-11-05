import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useNeeds } from "./data";
import { catalogQuery, conversationsQuery, healthQuery, jobsQuery, regulationsQuery, requestsQuery, resultsQuery, usersQuery } from "@/shared/api/queries";

// 받았는지 · 실패했는지를 봐야 해서 data.ts 의 훅 대신 쿼리를 직접 구독합니다.
export function useBoot(): { ready: boolean; error: string | null } {
  const need = useNeeds();
  const required: [boolean, UseQueryResult<unknown>][] = [
    [need.requests, useQuery({ ...requestsQuery(false), enabled: need.requests })],
    [need.mine, useQuery({ ...requestsQuery(true), enabled: need.mine })],
    [need.users, useQuery({ ...usersQuery(), enabled: need.users })],
    [need.catalog, useQuery({ ...catalogQuery(), enabled: need.catalog })],
    [need.results, useQuery({ ...resultsQuery(), enabled: need.results })],
  ];
  // 엔진 상태 · 기준 문서 · 작업 · 지난 대화는 못 받아도 화면을 막지 않습니다.
  useQuery({ ...healthQuery(), enabled: need.operator });
  useQuery({ ...conversationsQuery(), enabled: need.operator });
  useQuery({ ...regulationsQuery(), enabled: need.operator });
  useQuery({ ...jobsQuery(), enabled: need.results });

  const failed = required.find(([on, q]) => on && q.isError);
  return {
    ready: required.every(([on, q]) => !on || q.isSuccess || q.isError),
    error: failed ? failed[1].error?.message ?? "알 수 없는 오류" : null,
  };
}
