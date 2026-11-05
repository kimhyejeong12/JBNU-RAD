import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePanelAction, useUi } from "@/app/ui/state/UiContext";
import { send } from "@/shared/api/http";
import type { UserRow } from "@/shared/api/types";

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

// 자기 계정을 고치면 위쪽 바(["me"])도 다시 받아 옛 이름이 남지 않게 합니다.
export function useUserAction() {
  const qc = useQueryClient();
  return usePanelAction(async ({ id, patch, temporary_password, done = "✓ 저장했습니다" }: { id: number; patch?: Record<string, unknown>; temporary_password?: string; done?: string }) => {
    if (patch) {
      await send(`/api/users/${id}`, patch, "PATCH");
      await qc.invalidateQueries({ queryKey: ["me"] });
      // 부서 · 직무 · 퇴사일이 바뀌면 확인할 사람 · 보유 권한 재검토도 달라집니다.
      await qc.invalidateQueries({ queryKey: ["requests"] });
      return done;
    }
    await send(`/api/users/${id}/reset-password`, { temporary_password });
    return "✓ 초기화했습니다. 다음 로그인에 비밀번호를 바꾸게 됩니다";
  }, ["users"]);
}
