import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { queryClient, jobsQuery, nodeQuery, requestsQuery, statsQuery, userStatsQuery } from "./queries";

// 앱과 같은 기본값(staleTime Infinity · 재시도 없음)으로 빈 캐시를 만듭니다.
const client = () => new QueryClient({ defaultOptions: queryClient.getDefaultOptions() });

// 옛 화면은 기간 · 노드를 누를 때마다 다시 받았습니다. 받은 적 있는 키로 돌아가도 다시 받아야 합니다.
async function fetchesOnReturn(make: (key: string) => { queryKey: readonly unknown[] }): Promise<number> {
  const qc = client();
  let calls = 0;
  const opts = (key: string) => ({ ...make(key), queryFn: async () => { calls++; return { key }; } });
  const obs = new QueryObserver(qc, opts("a"));
  const unsub = obs.subscribe(() => {});
  await vi.waitFor(() => expect(calls).toBe(1));
  obs.setOptions(opts("b"));
  await vi.waitFor(() => expect(calls).toBe(2));
  obs.setOptions(opts("a"));
  await new Promise((r) => setTimeout(r, 50));
  unsub();
  return calls;
}

test("통계: 받은 적 있는 기간으로 돌아가도 다시 받는다", async () => {
  expect(await fetchesOnReturn((k) => statsQuery(k as "week"))).toBe(3);
  expect(await fetchesOnReturn((k) => userStatsQuery(k as "week"))).toBe(3);
});

test("노드 하나: 다른 노드를 봤다가 돌아와도 다시 받는다", async () => {
  expect(await fetchesOnReturn((k) => nodeQuery(k))).toBe(3);
});

// 감시 화면은 뒤에 둔 탭에서도 작업 · 판정 폴링을 멈추지 않습니다 (둘 다 감사 기록을 남기지 않습니다).
test("작업 · 결재함 폴링은 탭이 숨어 있어도 돈다", () => {
  expect(jobsQuery().refetchIntervalInBackground).toBe(true);
  expect(requestsQuery(false).refetchIntervalInBackground).toBe(true);
});
