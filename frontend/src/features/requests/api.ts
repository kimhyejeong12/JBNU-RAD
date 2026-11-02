import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePanelAction } from "@/app/ui/state/UiContext";
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

// 신청 — 끝나면 목록을 다시 받습니다 (결과 문구는 신청서가 띄웁니다).
export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) => send<{ request_no: string }>("/api/requests", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
}
