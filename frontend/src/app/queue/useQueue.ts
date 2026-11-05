import { useMemo } from "react";
import type { QueueItem } from "./types";
import { todoFirst } from "./select";
import { useCatalog, usePeople, useRegulations, useRequests, useResults, useUsers } from "@/app/session/data";
import { useViews } from "@/app/session/me";
import { userItem } from "@/features/accounts/lib";
import { accessItem } from "@/features/catalog/lib";
import { docItem } from "@/features/regulations/lib";
import { personItem, requestItem } from "@/features/requests/lib";
import { eventItems, policyItems, serverItems } from "@/features/review/lib";

export function useQueue(): QueueItem[] {
  const views = useViews();
  const hasAccess = views.includes("access");
  const hasDocs = views.includes("docs");
  const requests = useRequests();
  const people = usePeople();
  const users = useUsers();
  const catalog = useCatalog();
  const results = useResults();
  const regulations = useRegulations();
  return useMemo(() => todoFirst([
    ...requests.map(requestItem),
    ...people.map(personItem),
    ...users.map((u) => userItem(u)),
    ...(hasAccess ? catalog.map(accessItem) : []),
    ...(hasDocs ? regulations.map(docItem) : []),
    ...policyItems(results),
    ...serverItems(results),
    ...eventItems(results),
  ]), [requests, people, users, catalog, hasAccess, hasDocs, regulations, results]);
}
