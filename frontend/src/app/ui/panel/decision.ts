import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUi } from "@/app/ui/state/UiContext";
import { send } from "@/shared/api/http";
import type { Decision, Results } from "@/shared/api/types";

export type DecisionKind = "policy" | "event" | "server" | "suspect";

export const DECISIONS: Record<string, string> = {
  approve: "승인", cond: "조건부 승인", reject: "반려 확정", clear: "이상 없음", act: "조치 필요", done: "조치 완료",
};

// 로그 감시 · 서버 점검 · 위협 예측은 승인이 아니라 확인할 대상이라 결정 버튼이 다릅니다.
export type DecisionColor = "approve" | "cond" | "reject" | "done";
const CHECK: Record<string, DecisionColor> = { clear: "approve", act: "reject", done: "done" };
export const DECISION_SET: Record<DecisionKind, Record<string, DecisionColor>> = {
  policy: { approve: "approve", cond: "cond", reject: "reject", done: "done" },
  event: CHECK,
  server: CHECK,
  suspect: CHECK,
};

export const decisionTone: Record<DecisionColor, string> = {
  approve: "border-ok-line bg-ok-tint text-ok",
  cond: "border-warn-line bg-warn-tint text-warn-ink",
  reject: "border-risk bg-risk text-white",
  done: "border-ink bg-ink text-white",
};

// 처리 상태 — AI 판정과 따로 보입니다. 조치 필요는 아직 끝나지 않은 일입니다.
export function decisionState(d: Pick<Decision, "action"> | null | undefined): { text: string; tone: string } {
  if (!d) return { text: "결정 없음", tone: "border-line text-ink-dim" };
  if (d.action === "act") return { text: DECISIONS.act, tone: "border-risk text-risk" };
  if (d.action === "done") return { text: DECISIONS.done, tone: "border-ink text-ink" };
  return { text: DECISIONS[d.action] ?? d.action, tone: "border-ok-line text-ok" };
}

export interface DecisionTarget { kind: DecisionKind; itemKey: string; level: string | null; subject: string }

// 보안 총책임자는 결정 기록 전부를 받으므로 기록도 다시 받고, 보안 현황 집계도 다시 셉니다.
export function useDecide() {
  const qc = useQueryClient();
  const { setPanelMsg } = useUi();
  return useMutation({
    mutationFn: ({ target: t, action, comment }: { target: DecisionTarget; action: string; comment: string }) =>
      send<{ decision?: Decision | null }>("/api/decisions", {
        kind: t.kind, item_key: t.itemKey, action, ai_level: t.level || null, subject: t.subject,
        comment: action === "cancel" ? "" : comment || "",
      }),
    onSuccess: async (res, { target: t, action }) => {
      qc.setQueryData<Results>(["results"], (old) => {
        if (!old) return old;
        const mine = { ...(old.decisions?.[t.kind] ?? {}) };
        if (res.decision) mine[t.itemKey] = res.decision;
        else delete mine[t.itemKey];
        return { ...old, decisions: { ...old.decisions, [t.kind]: mine } };
      });
      qc.invalidateQueries({ queryKey: ["stats", "overview"] });
      if (qc.getQueryData<Results>(["results"])?.decision_log) await qc.invalidateQueries({ queryKey: ["results"] });
      setPanelMsg(action === "cancel" ? "✓ 결정을 취소했습니다" : `✓ 기록했습니다 — ${DECISIONS[action]}`);
    },
    onError: (e) => setPanelMsg(e.message),
  });
}
