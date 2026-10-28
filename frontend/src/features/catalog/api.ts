import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUi } from "@/app/ui/UiContext";
import { send } from "@/shared/api/http";
import type { AccessItem } from "@/shared/api/types";

// 권한 등록 — 목록을 다시 받은 뒤 새 권한을 고릅니다.
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

// 이름 · 시스템 · 분류 · 설명 · 켜짐 고치기. 코드는 못 바꾸고 지우지 않습니다 (지난 신청이 가리킵니다).
export function useUpdateAccess() {
  const qc = useQueryClient();
  const { setPanelMsg } = useUi();
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: Record<string, unknown> }) => send(`/api/access-catalog/${encodeURIComponent(code)}`, patch, "PATCH"),
    onSuccess: () => setPanelMsg("✓ 저장했습니다"),
    onError: (e) => setPanelMsg(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}
