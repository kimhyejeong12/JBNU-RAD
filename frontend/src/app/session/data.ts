import { useMemo, useEffect, useRef } from "react";
import { useQuery, type UseQueryResult, useQueryClient } from "@tanstack/react-query";
import { useMe } from "./me";
import { dataNeeds, type DataNeeds } from "./views";
import { EMPTY_RESULTS, catalogQuery, healthQuery, jobsQuery, peopleQuery, conversationQuery, conversationsQuery, regulationIndexQuery, regulationsQuery, requestsQuery, resultsQuery, usersQuery } from "@/shared/api/queries";
import type { AccessItem, AskItem, Conversation, Jobs, Regulation, RegulationIndex, RequestRow, Results, UserRow, WatchPerson } from "@/shared/api/types";
import { chipLabel, clauseHead, clauseText } from "@/shared/lib/clause";
import { refreshResults, shouldRefresh } from "@/shared/api/jobs";

// 받기 전에는 늘 같은 빈 배열을 돌려주어 useMemo 의존성이 그릴 때마다 바뀌지 않게 함
const NONE: never[] = [];

export const useNeeds = (): DataNeeds => dataNeeds(useMe().role);

export function useRequests(): RequestRow[] {
  const enabled = useNeeds().requests;
  return useQuery({ ...requestsQuery(false), enabled }).data ?? NONE;
}

export function usePeople(): WatchPerson[] {
  const enabled = useNeeds().requests;
  return useQuery({ ...peopleQuery(), enabled }).data ?? NONE;
}

export function useMine(): RequestRow[] {
  const enabled = useNeeds().mine;
  return useQuery({ ...requestsQuery(true), enabled }).data ?? NONE;
}

export function useUsers(): UserRow[] {
  const enabled = useNeeds().users;
  return useQuery({ ...usersQuery(), enabled }).data ?? NONE;
}

export function useCatalog(): AccessItem[] {
  const enabled = useNeeds().catalog;
  return useQuery({ ...catalogQuery(), enabled }).data ?? NONE;
}

export function useResults(): Results {
  const enabled = useNeeds().results;
  return useQuery({ ...resultsQuery(), enabled }).data ?? EMPTY_RESULTS;
}

export function useJobs(): Jobs | null {
  const enabled = useNeeds().results;
  return useQuery({ ...jobsQuery(), enabled }).data ?? null;
}

export function useRegulations(): Regulation[] {
  const enabled = useNeeds().operator;
  return useQuery({ ...regulationsQuery(), enabled }).data ?? NONE;
}

// 기준 문서마다 RAG 에 쌓인 조각 수 — 기준 문서 화면에서만 받음
export function useRegulationIndex(enabled: boolean): RegulationIndex | null {
  const operator = useNeeds().operator;
  return useQuery({ ...regulationIndexQuery(), enabled: enabled && operator }).data ?? null;
}

export function useHealth() {
  const enabled = useNeeds().operator;
  return useQuery({ ...healthQuery(), enabled });
}

export function useConversations(): Conversation[] {
  const enabled = useNeeds().operator;
  return useQuery({ ...conversationsQuery(), enabled }).data ?? NONE;
}

export function useConversation(id: string): AskItem[] {
  const enabled = useNeeds().operator;
  return useQuery({ ...conversationQuery(id), enabled }).data ?? NONE;
}

export function useClauses() {
  const regulations = useRegulations();
  return useMemo(() => ({
    label: (source: string) => chipLabel(source, regulations),
    text: (source: string) => clauseText(source, regulations),
    head: (source: string) => clauseHead(source, regulations),
  }), [regulations]);
}

// 받았는지 · 실패했는지를 봐야 해서 data.ts 의 훅 대신 쿼리를 직접 구독함
export function useBoot(): { ready: boolean; error: string | null } {
  const need = useNeeds();
  const required: [boolean, UseQueryResult<unknown>][] = [
    [need.requests, useQuery({ ...requestsQuery(false), enabled: need.requests })],
    [need.mine, useQuery({ ...requestsQuery(true), enabled: need.mine })],
    [need.users, useQuery({ ...usersQuery(), enabled: need.users })],
    [need.catalog, useQuery({ ...catalogQuery(), enabled: need.catalog })],
    [need.results, useQuery({ ...resultsQuery(), enabled: need.results })],
  ];
  // 엔진 상태 · 기준 문서 · 작업 · 지난 대화는 못 받아도 화면을 막지 않음
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

// 같은 값이 다시 오면(StrictMode 두 번 마운트) 아무것도 하지 않음
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
