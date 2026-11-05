import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePanelAction, useUi } from "@/app/ui/state/UiContext";
import { send } from "@/shared/api/http";
import type { AccessItem } from "@/shared/api/types";

export function useCreateAccess() {
  const qc = useQueryClient();
  const { selectSilent, setPanelMsg } = useUi();
  return useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) => send<AccessItem>("/api/access-catalog", body),
    onSuccess: async (made) => {
      setPanelMsg(`✓ ${made.code} 를 등록했습니다`);
      await qc.invalidateQueries({ queryKey: ["catalog"] });
      selectSilent(`access:${made.code}`);
    },
    onError: (e) => setPanelMsg(e.message),
  });
}

export function useUpdateAccess() {
  return usePanelAction(async ({ code, patch, done = "✓ 저장했습니다" }: { code: string; patch: Record<string, unknown>; done?: string }) => {
    await send(`/api/access-catalog/${encodeURIComponent(code)}`, patch, "PATCH");
    return done;
  }, ["catalog"]);
}
