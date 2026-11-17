import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "./me";
import { dataNeeds, type DataNeeds } from "./views";
import {
  EMPTY_RESULTS, catalogQuery, healthQuery, jobsQuery, peopleQuery, conversationQuery, conversationsQuery, regulationIndexQuery, regulationsQuery, requestsQuery, resultsQuery, usersQuery,
} from "@/shared/api/queries";
import type { AccessItem, AskItem, Conversation, Jobs, Regulation, RegulationIndex, RequestRow, Results, UserRow, WatchPerson } from "@/shared/api/types";
import { chipLabel, clauseHead, clauseText } from "@/shared/lib/clause";

// 받기 전에는 늘 같은 빈 배열을 돌려주어 useMemo 의존성이 그릴 때마다 바뀌지 않게 합니다.
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

// 기준 문서마다 RAG 에 쌓인 조각 수 — 기준 문서 화면에서만 받습니다.
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
