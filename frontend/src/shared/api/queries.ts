import { QueryClient, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getJSON } from "./http";
import { jobsInterval } from "./jobs";
import type {
  AccessItem, AskItem, Conversation, Health, Jobs, LogsPage, LogsParams, Me, NodeDetail, NodeRow, QaRecord, Regulation,
  RequestRow, Results, StatPeriod, Stats, UserRow, UserStats, WatchPerson,
} from "./types";

// /api/logs 는 조회마다 감사 기록을 남겨 암묵적 재요청(포커스 · 재접속 · 재시도)을 모두 끕니다.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false, staleTime: Infinity },
    mutations: { retry: false },
  },
});

export const EMPTY_RESULTS: Results = { summary: { failed: 0 }, sections: {}, servers: [], events: [], policy_review: null, generated_at: null };

export const meQuery = () => queryOptions({ queryKey: ["me"], queryFn: () => getJSON<Me>("/api/auth/me") });

export const healthQuery = () => queryOptions({ queryKey: ["health"], queryFn: () => getJSON<Health>("/api/health").catch(() => null) });
export const regulationsQuery = () => queryOptions({ queryKey: ["regulations"], queryFn: () => getJSON<Regulation[]>("/api/regulations").catch(() => [] as Regulation[]) });

// AI 판정 중인 신청이 있을 때만 3초마다, 뒤에 둔 탭에서도 받습니다.
export const requestsQuery = (mine: boolean) => queryOptions({
  queryKey: mine ? ["requests", "mine"] : ["requests"],
  queryFn: () => getJSON<RequestRow[]>(mine ? "/api/requests?mine=true" : "/api/requests"),
  refetchInterval: mine ? false : (q) => (q.state.data?.some((r) => r.judging || r.grant_review?.judging) ? 3000 : false),
  refetchIntervalInBackground: true,
});

// 키를 ["requests", …] 아래에 두어 신청 · 결재 · 회수 뒤 같이 다시 받습니다.
export const peopleQuery = () => queryOptions({
  queryKey: ["requests", "people"],
  queryFn: () => getJSON<WatchPerson[]>("/api/people"),
  refetchInterval: (q) => (q.state.data?.some((p) => p.flags.some((f) => f.text.endsWith("재검토 대기"))) ? 3000 : false),
  refetchIntervalInBackground: true,
});

export const usersQuery = () => queryOptions({ queryKey: ["users"], queryFn: () => getJSON<UserRow[]>("/api/users") });
export const catalogQuery = () => queryOptions({ queryKey: ["catalog"], queryFn: () => getJSON<AccessItem[]>("/api/access-catalog") });
export const resultsQuery = () => queryOptions({ queryKey: ["results"], queryFn: () => getJSON<Results>("/api/results") });

// 자동 감시는 화면이 시작하지 않아 쉬는 동안에도 30초마다 봅니다.
export const jobsQuery = () => queryOptions({
  queryKey: ["jobs"],
  queryFn: () => getJSON<Jobs>("/api/jobs"),
  refetchInterval: (q) => jobsInterval(q.state.data),
  refetchIntervalInBackground: true,
});

export const conversationsQuery = () => queryOptions({ queryKey: ["qa", "list"], queryFn: () => getJSON<Conversation[]>("/api/qa") });
export const conversationQuery = (id: string) => queryOptions({
  queryKey: ["qa", id],
  queryFn: async (): Promise<AskItem[]> =>
    (await getJSON<QaRecord[]>(`/api/qa?conversation=${id}`)).map(({ question, id: no, ...rest }) => ({ ...rest, id: `qa-${no}`, q: question, started: null })),
});

// staleTime Infinity 면 받은 적 있는 키로 돌아올 때 다시 받지 않아 0 으로 둡니다.
export const nodesQuery = () => queryOptions({ queryKey: ["nodes"], queryFn: () => getJSON<NodeRow[]>("/api/nodes"), staleTime: 0 });
export const nodeQuery = (name: string) => queryOptions({ queryKey: ["nodes", name], queryFn: () => getJSON<NodeDetail>(`/api/nodes/${encodeURIComponent(name)}`), staleTime: 0 });

// 조회마다 감사 기록이 남아 같은 조건은 다시 받지 않습니다.
export const logsQuery = (p: LogsParams) => queryOptions({
  queryKey: ["logs", p],
  queryFn: () => getJSON<LogsPage>(`/api/logs?${new URLSearchParams({ period: p.period, user: p.user, solution: p.solution, how: p.how, page: String(p.page) })}`),
  staleTime: 0,
  refetchOnMount: false,
  gcTime: Infinity,
  placeholderData: keepPreviousData,
});

// 노드와 같은 이유로 staleTime 0 입니다.
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
