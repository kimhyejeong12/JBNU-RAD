import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getJSON } from "./http";
import { jobsInterval } from "./jobs";
import type {
  AccessItem, AskItem, AskKind, Health, Jobs, LogsPage, LogsParams, Me, NodeDetail, NodeRow, QaRecord, Regulation,
  RequestRow, Results, StatPeriod, Stats, UserRow, UserStats,
} from "./types";

export const EMPTY_RESULTS: Results = { summary: { failed: 0 }, sections: {}, policies: [], servers: [], events: [], policy_review: null, generated_at: null };

export const meQuery = () => queryOptions({ queryKey: ["me"], queryFn: () => getJSON<Me>("/api/auth/me") });

// 엔진 상태 · 기준 문서는 못 받아도 화면을 막지 않습니다 (경고만).
export const healthQuery = () => queryOptions({ queryKey: ["health"], queryFn: () => getJSON<Health>("/api/health").catch(() => null) });
export const regulationsQuery = () => queryOptions({ queryKey: ["regulations"], queryFn: () => getJSON<Regulation[]>("/api/regulations").catch(() => [] as Regulation[]) });

// 결재자 목록은 AI 판정 중인 신청이 있을 때만 3초마다. 일반 사용자의 내 신청은 폴링하지 않습니다.
export const requestsQuery = (mine: boolean) => queryOptions({
  queryKey: mine ? ["requests", "mine"] : ["requests"],
  queryFn: () => getJSON<RequestRow[]>(mine ? "/api/requests?mine=true" : "/api/requests"),
  refetchInterval: mine ? false : (q) => (q.state.data?.some((r) => r.judging) ? 3000 : false),
});

export const usersQuery = () => queryOptions({ queryKey: ["users"], queryFn: () => getJSON<UserRow[]>("/api/users") });
export const catalogQuery = () => queryOptions({ queryKey: ["catalog"], queryFn: () => getJSON<AccessItem[]>("/api/access-catalog") });
export const resultsQuery = () => queryOptions({ queryKey: ["results"], queryFn: () => getJSON<Results>("/api/results") });

// 돌고 있으면 2초, 쉬면 30초 — 자동 감시는 화면이 시작하지 않으므로 쉬는 동안에도 가끔 봅니다.
export const jobsQuery = () => queryOptions({
  queryKey: ["jobs"],
  queryFn: () => getJSON<Jobs>("/api/jobs"),
  refetchInterval: (q) => jobsInterval(q.state.data),
});

// 질의 기록은 내 것만 옵니다. 메뉴마다 따로라 정책 질의 · 서버 질의 · 로그 질의를 나눠 받고, 새 질의는 이 캐시에 덧붙입니다.
export const qaQuery = (kind: AskKind) => queryOptions({
  queryKey: ["qa", kind],
  queryFn: async (): Promise<AskItem[]> =>
    (await getJSON<QaRecord[]>(`/api/qa?kind=${kind}`)).map(({ question, ...rest }, n) => ({ ...rest, id: `qa-${n}`, q: question, started: null })),
});

// 노드 · 통계는 탭에 들어올 때마다 다시 받습니다.
export const nodesQuery = () => queryOptions({ queryKey: ["nodes"], queryFn: () => getJSON<NodeRow[]>("/api/nodes"), refetchOnMount: "always" });
export const nodeQuery = (name: string) => queryOptions({ queryKey: ["nodes", name], queryFn: () => getJSON<NodeDetail>(`/api/nodes/${encodeURIComponent(name)}`), refetchOnMount: "always" });

// 로그 조회는 조회마다 감사 기록이 남으므로 조건이 바뀔 때만 받고, 같은 조건은 다시 받지 않습니다.
export const logsQuery = (p: LogsParams) => queryOptions({
  queryKey: ["logs", p],
  queryFn: () => getJSON<LogsPage>(`/api/logs?${new URLSearchParams({ period: p.period, user: p.user, solution: p.solution, how: p.how, page: String(p.page) })}`),
  staleTime: 0,
  refetchOnMount: false,
  gcTime: Infinity,
  placeholderData: keepPreviousData,
});

export const statsQuery = (kind: "stats" | "ustats", period: StatPeriod) => queryOptions({
  queryKey: ["stats", kind, period],
  queryFn: () => getJSON<Stats | UserStats>(`${kind === "stats" ? "/api/stats" : "/api/user-stats"}?period=${period}`),
  refetchOnMount: "always",
});
