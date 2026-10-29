import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "./me";
import { dataNeeds, type DataNeeds } from "./views";
import {
  EMPTY_RESULTS, catalogQuery, healthQuery, jobsQuery, qaQuery, regulationsQuery, requestsQuery, resultsQuery, usersQuery,
} from "@/shared/api/queries";
import type { AccessItem, AskItem, AskKind, Jobs, Regulation, RequestRow, Results, UserRow } from "@/shared/api/types";
import { chipLabel, clauseText } from "@/shared/lib/clause";

// 역할에 따라 받는 데이터 — 같은 키를 여러 컴포넌트가 구독해도 요청은 한 번입니다.
// 받기 전에는 늘 같은 빈 배열을 돌려주어 useMemo 의존성이 그릴 때마다 바뀌지 않게 합니다.
const NONE: never[] = [];

export const useNeeds = (): DataNeeds => dataNeeds(useMe().role);

export function useRequests(): RequestRow[] {
  const enabled = useNeeds().requests;
  return useQuery({ ...requestsQuery(false), enabled }).data ?? NONE;
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

// 내 질의 기록 — 메뉴마다 따로 (정책 · 서버 · 로그).
export function useQa(kind: AskKind): AskItem[] {
  const enabled = useNeeds().operator;
  return useQuery({ ...qaQuery(kind), enabled }).data ?? NONE;
}

// 근거 조항 전문 · 칩 글자 — 기준 문서와 마지막 검토의 정책 원본으로 풉니다.
export function useClauses() {
  const regulations = useRegulations();
  const policies = useResults().policies;
  return useMemo(() => ({
    label: (source: string) => chipLabel(source, regulations, policies),
    text: (source: string) => clauseText(source, regulations, policies),
  }), [regulations, policies]);
}
