import { useQuery } from "@tanstack/react-query";
import { useUi } from "@/app/ui/state/UiContext";
import { logsQuery } from "@/shared/api/queries";

// 고른 줄은 조건이 아니라 키에 넣지 않습니다 (조회마다 감사 기록이 남습니다).
export function useLogsPage() {
  const { period, user, solution, how, page } = useUi().ui.logs;
  return useQuery(logsQuery({ period, user, solution, how, page }));
}
