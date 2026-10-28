import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMe } from "./me";
import { RESULT_VIEWS, ROLE_VIEWS } from "./views";
import { catalogQuery, healthQuery, jobsQuery, qaQuery, regulationsQuery, requestsQuery, resultsQuery, usersQuery } from "@/shared/api/queries";

// 로그인한 역할이 쓰는 데이터를 한 번 받습니다. 엔진 상태 · 작업 · 기준 문서는 못 받아도 화면을 막지 않습니다.
export function useBoot(): { ready: boolean; error: string | null } {
  const me = useMe();
  const views = ROLE_VIEWS[me.role];
  const operator = me.role !== "user";
  const hasRequests = views.includes("requests");
  const hasMine = views.includes("mine");
  const hasUsers = views.includes("users");
  const hasCatalog = views.includes("access") || hasMine;
  const hasResults = views.some((v) => RESULT_VIEWS.has(v));

  const requests = useQuery({ ...requestsQuery(false), enabled: hasRequests });
  const mine = useQuery({ ...requestsQuery(true), enabled: hasMine });
  const users = useQuery({ ...usersQuery(), enabled: hasUsers });
  const catalog = useQuery({ ...catalogQuery(), enabled: hasCatalog });
  const results = useQuery({ ...resultsQuery(), enabled: hasResults });
  const qaPolicy = useQuery({ ...qaQuery("policy"), enabled: operator });
  const qaServers = useQuery({ ...qaQuery("servers"), enabled: operator });
  const qaLogs = useQuery({ ...qaQuery("logs"), enabled: operator });
  useQuery({ ...healthQuery(), enabled: operator });
  useQuery({ ...regulationsQuery(), enabled: operator });
  useQuery({ ...jobsQuery(), enabled: hasResults });

  const required: [boolean, UseQueryResult<unknown>][] = [
    [hasRequests, requests], [hasMine, mine], [hasUsers, users], [hasCatalog, catalog], [hasResults, results],
    [operator, qaPolicy], [operator, qaServers], [operator, qaLogs],
  ];
  const failed = required.find(([on, q]) => on && q.isError);
  return {
    ready: required.every(([on, q]) => !on || q.isSuccess || q.isError),
    error: failed ? failed[1].error?.message ?? "알 수 없는 오류" : null,
  };
}
