import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useNeeds } from "./data";
import { catalogQuery, healthQuery, jobsQuery, qaQuery, regulationsQuery, requestsQuery, resultsQuery, usersQuery } from "@/shared/api/queries";

// 로그인한 역할이 쓰는 데이터를 한 번 받습니다. 받았는지 · 실패했는지를 봐야 하므로 data.ts 의 훅 대신 쿼리를 직접 구독합니다.
export function useBoot(): { ready: boolean; error: string | null } {
  const need = useNeeds();
  const required: [boolean, UseQueryResult<unknown>][] = [
    [need.requests, useQuery({ ...requestsQuery(false), enabled: need.requests })],
    [need.mine, useQuery({ ...requestsQuery(true), enabled: need.mine })],
    [need.users, useQuery({ ...usersQuery(), enabled: need.users })],
    [need.catalog, useQuery({ ...catalogQuery(), enabled: need.catalog })],
    [need.results, useQuery({ ...resultsQuery(), enabled: need.results })],
    [need.operator, useQuery({ ...qaQuery("policy"), enabled: need.operator })],
    [need.operator, useQuery({ ...qaQuery("servers"), enabled: need.operator })],
    [need.operator, useQuery({ ...qaQuery("logs"), enabled: need.operator })],
  ];
  // 엔진 상태 · 기준 문서 · 작업은 못 받아도 화면을 막지 않습니다 (경고만).
  useQuery({ ...healthQuery(), enabled: need.operator });
  useQuery({ ...regulationsQuery(), enabled: need.operator });
  useQuery({ ...jobsQuery(), enabled: need.results });

  const failed = required.find(([on, q]) => on && q.isError);
  return {
    ready: required.every(([on, q]) => !on || q.isSuccess || q.isError),
    error: failed ? failed[1].error?.message ?? "알 수 없는 오류" : null,
  };
}
