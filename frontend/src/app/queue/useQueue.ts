import { useMemo } from "react";
import type { QueueItem } from "./types";
import { todoFirst } from "./select";
import { useCatalog, useRegulationIndex, useRegulations, useRequests, useResults, useUsers } from "@/app/session/data";
import { useViews } from "@/app/session/me";
import { userItem } from "@/features/accounts/lib";
import { accessItem } from "@/features/catalog/lib";
import { docItem } from "@/features/regulations/lib";
import { requestItem } from "@/features/requests/lib";
import { eventItems, passItems, policyItems, serverItems } from "@/features/review/lib";

export function useQueue(): QueueItem[] {
  const views = useViews();
  const hasAccess = views.includes("access");
  const hasDocs = views.includes("docs");
  const requests = useRequests();
  const users = useUsers();
  const catalog = useCatalog();
  const results = useResults();
  const regulations = useRegulations();
  const index = useRegulationIndex(hasDocs);
  return useMemo(() => todoFirst([
    ...requests.map(requestItem),
    ...users.map((u) => userItem(u)),
    ...(hasAccess ? catalog.map(accessItem) : []),
    ...(hasDocs ? regulations.map((d) => docItem(d, index)) : []),
    ...policyItems(results, regulations),
    ...passItems(results, regulations),
    ...serverItems(results),
    ...eventItems(results),
  ]), [requests, users, catalog, hasAccess, hasDocs, regulations, index, results]);
}
