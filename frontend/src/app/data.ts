import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "./me";
import { RESULT_VIEWS, ROLE_VIEWS } from "./views";
import { EMPTY_RESULTS, healthQuery, jobsQuery, regulationsQuery, resultsQuery } from "@/shared/api/queries";
import type { Jobs, Regulation, Results } from "@/shared/api/types";
import { chipLabel, clauseText } from "@/shared/lib/clause";

// 역할에 따라 받는 데이터 — 같은 키를 여러 컴포넌트가 구독해도 요청은 한 번입니다.

export const useOperator = (): boolean => useMe().role !== "user";

export function useHasResults(): boolean {
  const me = useMe();
  return ROLE_VIEWS[me.role].some((v) => RESULT_VIEWS.has(v));
}

export function useResults(): Results {
  const enabled = useHasResults();
  return useQuery({ ...resultsQuery(), enabled }).data ?? EMPTY_RESULTS;
}

export function useJobs(): Jobs | null {
  const enabled = useHasResults();
  return useQuery({ ...jobsQuery(), enabled }).data ?? null;
}

export function useRegulations(): Regulation[] {
  const enabled = useOperator();
  return useQuery({ ...regulationsQuery(), enabled }).data ?? [];
}

export function useHealth() {
  const enabled = useOperator();
  return useQuery({ ...healthQuery(), enabled });
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
