import { usePanelAction, usePanelCreate } from "@/app/ui/state/UiContext";
import { send } from "@/shared/api/http";
import type { AccessItem } from "@/shared/api/types";

export const useCreateAccess = () => usePanelCreate((body: Record<string, FormDataEntryValue>) => send<AccessItem>("/api/access-catalog", body),
  "catalog", (made) => [`✓ ${made.code} 를 등록했습니다`, `access:${made.code}`]);

export function useUpdateAccess() {
  return usePanelAction(async ({ code, patch, done = "✓ 저장했습니다" }: { code: string; patch: Record<string, unknown>; done?: string }) => {
    await send(`/api/access-catalog/${encodeURIComponent(code)}`, patch, "PATCH");
    return done;
  }, ["catalog"]);
}
