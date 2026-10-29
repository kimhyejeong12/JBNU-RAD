import { useMemo } from "react";
import type { QueueItem } from "./types";
import { useCatalog, useMine, useRequests, useResults, useUsers } from "@/app/session/data";
import { useViews } from "@/app/session/me";
import { userItem } from "@/features/accounts/lib";
import { accessItem } from "@/features/catalog/lib";
import { mineItem, requestItem } from "@/features/requests/lib";
import { eventItems, policyItems, serverItems } from "@/features/review/lib";

// 메뉴마다 다른 데이터를 한 목록 형식으로 — 각 기능이 항목 변환 함수를 내놓고 여기서 모읍니다.
export function useQueue(): QueueItem[] {
  // 권한 목록은 보안 총책임자에게만 목록 항목입니다 (일반 사용자는 신청서의 고르기 칸으로만 봅니다).
  const hasAccess = useViews().includes("access");
  const requests = useRequests();
  const mine = useMine();
  const users = useUsers();
  const catalog = useCatalog();
  const results = useResults();
  return useMemo(() => [
    ...requests.map(requestItem),
    ...mine.map(mineItem),
    ...users.map(userItem),
    ...(hasAccess ? catalog.map(accessItem) : []),
    ...policyItems(results),
    ...serverItems(results),
    ...eventItems(results),
  ], [requests, mine, users, catalog, hasAccess, results]);
}
