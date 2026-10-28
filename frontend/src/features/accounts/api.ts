import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUi } from "@/app/ui/UiContext";
import { send } from "@/shared/api/http";
import type { UserRow } from "@/shared/api/types";

// 계정 만들기 — 목록을 다시 받은 뒤 새 계정을 고릅니다.
export function useCreateUser() {
  const qc = useQueryClient();
  const { selectSilent, setPanelMsg } = useUi();
  return useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) => send<UserRow>("/api/users", body),
    onSuccess: async (made) => {
      setPanelMsg(`✓ ${made.login_id} 계정을 만들었습니다`);
      await qc.invalidateQueries({ queryKey: ["users"] });
      selectSilent(`user:${made.id}`);
    },
    onError: (e) => setPanelMsg(e.message),
  });
}

// 이름 · 부서 · 역할 · 로그 사용자 ID · 활성 고치기, 비밀번호 초기화 — 끝나면 목록을 다시 받아 서버 값으로 그립니다.
export function useUserAction() {
  const qc = useQueryClient();
  const { setPanelMsg } = useUi();
  return useMutation({
    mutationFn: async ({ id, patch, temporary_password }: { id: number; patch?: Record<string, unknown>; temporary_password?: string }): Promise<string> => {
      if (patch) {
        await send(`/api/users/${id}`, patch, "PATCH");
        return "✓ 저장했습니다";
      }
      await send(`/api/users/${id}/reset-password`, { temporary_password });
      return "✓ 초기화했습니다. 다음 로그인에 비밀번호를 바꾸게 됩니다";
    },
    onSuccess: (msg) => setPanelMsg(msg),
    onError: (e) => setPanelMsg(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
