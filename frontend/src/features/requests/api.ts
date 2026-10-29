import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePanelAction, useUi } from "@/app/ui/UiContext";
import { send } from "@/shared/api/http";

export type RequestAct = "approve" | "reject" | "revoke" | "withdraw" | "rejudge";

interface ActionArgs { no: string; act: RequestAct; comment?: string; reason?: string }

// 결재 · 회수 · 철회 · 다시 판정 — 결과 문구는 패널 메시지로, 끝나면 목록을 다시 받습니다.
export function useRequestAction() {
  return usePanelAction(async ({ no, act, comment, reason }: ActionArgs) => {
    const base = `/api/requests/${encodeURIComponent(no)}`;
    if (act === "approve" || act === "reject") {
      await send(`${base}/decision`, { action: act, comment: comment || "" });
      return `✓ ${act === "approve" ? "승인" : "반려"}했습니다`;
    }
    if (act === "revoke") {
      await send(`${base}/revoke`, { reason });
      return "✓ 회수했습니다";
    }
    if (act === "withdraw") {
      await send(`${base}/withdraw`);
      return "✓ 철회했습니다";
    }
    await send(`${base}/rejudge`);
    return "";
  }, ["requests"]);
}

// 신청 — 목록을 다시 받은 뒤 새 신청을 고릅니다 (받기 전에 고르면 목록에 없어 선택이 풀립니다).
export function useCreateRequest() {
  const qc = useQueryClient();
  const { selectSilent } = useUi();
  return useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) => send<{ request_no: string }>("/api/requests", body),
    onSuccess: async (made) => {
      await qc.invalidateQueries({ queryKey: ["requests"] });
      selectSilent(`mine:${made.request_no}`);
    },
  });
}
