import { QueryClient } from "@tanstack/react-query";

// 암묵적 재요청(창 포커스 · 재접속 · 재시도)을 모두 끕니다 — /api/logs 는 조회마다 감사 기록을 남기고,
// 옛 화면도 폴링 간격과 명시적 갱신으로만 다시 받았습니다.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false, staleTime: Infinity },
    mutations: { retry: false },
  },
});
