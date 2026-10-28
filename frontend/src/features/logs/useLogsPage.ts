import { useQuery } from "@tanstack/react-query";
import { useUi } from "@/app/ui/UiContext";
import { logsQuery } from "@/shared/api/queries";

// 지금 조건의 로그 한 쪽 — 탭과 패널이 같은 쿼리를 봅니다.
// 고른 줄(selected)은 조건이 아니므로 키에 넣지 않습니다 (조회마다 감사 기록이 남습니다).
export function useLogsPage() {
  const { period, user, solution, how, page } = useUi().ui.logs;
  return useQuery(logsQuery({ period, user, solution, how, page }));
}
