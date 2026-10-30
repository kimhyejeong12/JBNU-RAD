import { QueryClient, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getJSON } from "./http";
import { jobsInterval } from "./jobs";
import type {
  AccessItem, AskItem, AskKind, Health, Jobs, LogsPage, LogsParams, Me, NodeDetail, NodeRow, QaRecord, Regulation,
  RequestRow, Results, StatPeriod, Stats, UserRow, UserStats,
} from "./types";

// 암묵적 재요청(창 포커스 · 재접속 · 재시도)을 모두 끕니다 — /api/logs 는 조회마다 감사 기록을 남기고,
// 옛 화면도 폴링 간격과 명시적 갱신으로만 다시 받았습니다.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false, staleTime: Infinity },
    mutations: { retry: false },
  },
});

export const EMPTY_RESULTS: Results = { summary: { failed: 0 }, sections: {}, policies: [], servers: [], events: [], policy_review: null, generated_at: null };

export const meQuery = () => queryOptions({ queryKey: ["me"], queryFn: () => getJSON<Me>("/api/auth/me") });

// 엔진 상태 · 기준 문서는 못 받아도 화면을 막지 않습니다 (경고만).
export const healthQuery = () => queryOptions({ queryKey: ["health"], queryFn: () => getJSON<Health>("/api/health").catch(() => null) });
export const regulationsQuery = () => queryOptions({ queryKey: ["regulations"], queryFn: () => getJSON<Regulation[]>("/api/regulations").catch(() => [] as Regulation[]) });

// 결재자 목록은 AI 판정 중인 신청이 있을 때만 3초마다 — 뒤에 둔 탭에서도 (감사 기록을 남기지 않습니다). 일반 사용자의 내 신청은 폴링하지 않습니다.
export const requestsQuery = (mine: boolean) => queryOptions({
  queryKey: mine ? ["requests", "mine"] : ["requests"],
  queryFn: () => getJSON<RequestRow[]>(mine ? "/api/requests?mine=true" : "/api/requests"),
  refetchInterval: mine ? false : (q) => (q.state.data?.some((r) => r.judging) ? 3000 : false),
  refetchIntervalInBackground: true,
});

export const usersQuery = () => queryOptions({ queryKey: ["users"], queryFn: () => getJSON<UserRow[]>("/api/users") });
export const catalogQuery = () => queryOptions({ queryKey: ["catalog"], queryFn: () => getJSON<AccessItem[]>("/api/access-catalog") });
export const resultsQuery = () => queryOptions({ queryKey: ["results"], queryFn: () => getJSON<Results>("/api/results") });

// 돌고 있으면 2초, 쉬면 30초 — 자동 감시는 화면이 시작하지 않으므로 쉬는 동안에도 가끔 봅니다. 감시 화면은 뒤에 둔 탭에서도 계속 봅니다.
export const jobsQuery = () => queryOptions({
  queryKey: ["jobs"],
  queryFn: () => getJSON<Jobs>("/api/jobs"),
  refetchInterval: (q) => jobsInterval(q.state.data),
  refetchIntervalInBackground: true,
});

// 질의 기록은 내 것만 옵니다. 메뉴마다 따로라 정책 질의 · 서버 질의 · 로그 질의를 나눠 받고, 새 질의는 이 캐시에 덧붙입니다.
export const qaQuery = (kind: AskKind) => queryOptions({
  queryKey: ["qa", kind],
  queryFn: async (): Promise<AskItem[]> =>
    (await getJSON<QaRecord[]>(`/api/qa?kind=${kind}`)).map(({ question, ...rest }, n) => ({ ...rest, id: `qa-${n}`, q: question, started: null })),
});

// 노드 · 통계는 옛 화면처럼 탭에 들어올 때 · 기간 · 노드를 고를 때마다 다시 받습니다. 기본값 staleTime Infinity 는 받은 적 있는 키로 돌아올 때
// 다시 받지 않으므로(refetchOnMount 는 마운트 때만) 0 으로 둡니다 — 창 포커스 · 재접속 재요청은 전역에서 꺼져 있어 그 밖에는 받지 않습니다.
export const nodesQuery = () => queryOptions({ queryKey: ["nodes"], queryFn: () => getJSON<NodeRow[]>("/api/nodes"), staleTime: 0 });
export const nodeQuery = (name: string) => queryOptions({ queryKey: ["nodes", name], queryFn: () => getJSON<NodeDetail>(`/api/nodes/${encodeURIComponent(name)}`), staleTime: 0 });

// 로그 조회는 조회마다 감사 기록이 남으므로 조건이 바뀔 때만 받고, 같은 조건은 다시 받지 않습니다.
export const logsQuery = (p: LogsParams) => queryOptions({
  queryKey: ["logs", p],
  queryFn: () => getJSON<LogsPage>(`/api/logs?${new URLSearchParams({ period: p.period, user: p.user, solution: p.solution, how: p.how, page: String(p.page) })}`),
  staleTime: 0,
  refetchOnMount: false,
  gcTime: Infinity,
  placeholderData: keepPreviousData,
});

// 통계도 같은 이유로 staleTime 0. 기간을 바꾸면 같은 종류의 직전 값을 흐리게 보여줍니다.
export const statsQuery = (period: StatPeriod) => queryOptions({
  queryKey: ["stats", "stats", period],
  queryFn: () => getJSON<Stats>(`/api/stats?period=${period}`),
  staleTime: 0,
  placeholderData: keepPreviousData,
});
export const userStatsQuery = (period: StatPeriod) => queryOptions({
  queryKey: ["stats", "ustats", period],
  queryFn: () => getJSON<UserStats>(`/api/user-stats?period=${period}`),
  staleTime: 0,
  placeholderData: keepPreviousData,
});
