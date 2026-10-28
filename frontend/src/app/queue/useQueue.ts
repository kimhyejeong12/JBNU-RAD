import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QueueItem } from "./types";
import { useMe } from "@/app/me";
import { ROLE_VIEWS } from "@/app/views";
import { mineItem, requestItem } from "@/features/requests/items";
import { requestsQuery } from "@/shared/api/queries";

// 메뉴마다 다른 데이터를 한 목록 형식으로 — 각 기능이 항목 변환 함수를 내놓고 여기서 모읍니다.
export function useQueue(): QueueItem[] {
  const me = useMe();
  const views = ROLE_VIEWS[me.role];
  const requests = useQuery({ ...requestsQuery(false), enabled: views.includes("requests") }).data;
  const mine = useQuery({ ...requestsQuery(true), enabled: views.includes("mine") }).data;
  return useMemo(() => [
    ...(requests ?? []).map(requestItem),
    ...(mine ?? []).map(mineItem),
  ], [requests, mine]);
}
