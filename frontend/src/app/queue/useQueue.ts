import { useMemo } from "react";
import type { QueueItem } from "./types";
import { useCatalog, useRegulations, useRequests, useResults, useUsers } from "@/app/session/data";
import { useViews } from "@/app/session/me";
import { userItem } from "@/features/accounts/lib";
import { accessItem } from "@/features/catalog/lib";
import { docItem } from "@/features/regulations/lib";
import { requestItem } from "@/features/requests/lib";
import { eventItems, policyItems, serverItems } from "@/features/review/lib";

// 메뉴마다 다른 데이터를 한 목록 형식으로 — 각 기능이 항목 변환 함수를 내놓고 여기서 모읍니다.
export function useQueue(): QueueItem[] {
  // 권한 목록은 보안 총책임자에게만 목록 항목입니다 (일반 사용자는 신청서의 고르기 칸으로만 봅니다).
  const views = useViews();
  const hasAccess = views.includes("access");
  // 기준 문서도 보안 총책임자에게만 목록 항목입니다 (보안 운영자는 사이드바 아래 버튼으로 원문 창을 엽니다).
  const hasDocs = views.includes("docs");
  const requests = useRequests();
  const users = useUsers();
  const catalog = useCatalog();
  const results = useResults();
  const regulations = useRegulations();
  return useMemo(() => [
    ...requests.map(requestItem),
    ...users.map(userItem),
    ...(hasAccess ? catalog.map(accessItem) : []),
    ...(hasDocs ? regulations.map(docItem) : []),
    ...policyItems(results),
    ...serverItems(results),
    ...eventItems(results),
  ], [requests, users, catalog, hasAccess, hasDocs, regulations, results]);
}
