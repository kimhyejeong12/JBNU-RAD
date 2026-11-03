import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePanelAction, useUi } from "@/app/ui/state/UiContext";
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

// 이름 · 부서 · 역할 · 로그 사용자 ID 고치기 · 활성/정지 (done = 완료 문구), 비밀번호 초기화.
// 자기 계정의 이름 · 부서를 고치면 위쪽 바(내 정보, ["me"])도 다시 받습니다 — 목록(["users"])만 다시 받으면 새로고침 전까지 옛 이름이 남아서.
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
