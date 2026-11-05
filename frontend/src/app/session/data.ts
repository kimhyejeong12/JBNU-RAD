import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "./me";
import { dataNeeds, type DataNeeds } from "./views";
import {
  EMPTY_RESULTS, catalogQuery, healthQuery, jobsQuery, peopleQuery, qaQuery, regulationsQuery, requestsQuery, resultsQuery, usersQuery,
} from "@/shared/api/queries";
import type { AccessItem, AskItem, AskKind, Jobs, Regulation, RequestRow, Results, UserRow, WatchPerson } from "@/shared/api/types";
import { chipLabel, clauseText } from "@/shared/lib/clause";

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

export function useHealth() {
  const enabled = useNeeds().operator;
  return useQuery({ ...healthQuery(), enabled });
}

export function useQa(kind: AskKind): AskItem[] {
  const enabled = useNeeds().operator;
  return useQuery({ ...qaQuery(kind), enabled }).data ?? NONE;
}

export function useClauses() {
  const regulations = useRegulations();
  return useMemo(() => ({
    label: (source: string) => chipLabel(source, regulations),
    text: (source: string) => clauseText(source, regulations),
  }), [regulations]);
}
