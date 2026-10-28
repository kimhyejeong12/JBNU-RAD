import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DECISIONS } from "./constants";
import { useUi } from "@/app/ui/UiContext";
import type { QueueItem } from "@/app/queue/types";
import { send } from "@/shared/api/http";
import type { Decision, Results } from "@/shared/api/types";

export type ReviewItem = Extract<QueueItem, { type: "policy" | "server" | "event" }>;

interface DecideArgs { it: ReviewItem; action: string; comment: string }

// 정책 문제 · 서버 점검 · 로그 판정에 대한 운영자 결정 · 취소. 지금 결정은 캐시에 바로 반영하고,
// 보안 총책임자(결정 기록 전부를 받는 사람)는 기록도 다시 받습니다.
export function useDecide() {
  const qc = useQueryClient();
  const { setPanelMsg } = useUi();
  return useMutation({
    mutationFn: ({ it, action, comment }: DecideArgs) => send<{ decision?: Decision | null }>("/api/decisions", {
      kind: it.type, item_key: it.itemKey, action, ai_level: it.level || null,
      subject: it.type === "policy" ? `${it.who} · ${it.raw.kind}` : it.raw.title,
      comment: action === "cancel" ? "" : comment || "",
    }),
    onSuccess: async (res, { it, action }) => {
      qc.setQueryData<Results>(["results"], (old) => {
        if (!old) return old;
        const mine = { ...(old.decisions?.[it.type] ?? {}) };
        if (res.decision) mine[it.itemKey!] = res.decision;
        else delete mine[it.itemKey!];
        return { ...old, decisions: { ...old.decisions, [it.type]: mine } };
      });
      if (qc.getQueryData<Results>(["results"])?.decision_log) await qc.invalidateQueries({ queryKey: ["results"] });
      setPanelMsg(action === "cancel" ? "✓ 결정을 취소했습니다" : `✓ 기록했습니다 — ${DECISIONS[action]}`);
    },
    onError: (e) => setPanelMsg(e.message),
  });
}
