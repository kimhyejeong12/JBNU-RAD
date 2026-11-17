import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePanelAction, useUi } from "@/app/ui/state/UiContext";
import type { NodeRow, NodeWithKey } from "@/shared/api/types";
import { send } from "@/shared/api/http";

export type NodeStateClass = "off" | "wait" | "stale" | "on";

export const nodeStateTone: Record<NodeStateClass, string> = { on: "text-ok", stale: "text-warn", off: "text-ink-dim", wait: "text-ink-dim" };
export const nodeStateText = "whitespace-nowrap text-[12px] font-bold";
export const nodeActions = "mt-2.5 flex flex-wrap gap-2";

// 꺼짐 · 키 없음 · 끊김 · 기다리는 중 · 수집 중 순서로 봄
export function nodeState(n: NodeRow): [NodeStateClass, string, string] {
  if (!n.enabled) return ["off", "꺼짐", "수집, 점검 안 함"];
  if (!n.key_issued) return ["wait", "키 없음", "키를 발급하세요"];
  if (n.stale) return ["stale", "끊김", n.interval_min ? `${n.interval_min * 3}분 넘게 소식 없음` : "소식 없음"];
  if (!n.last_collected_at) return ["wait", "기다리는 중", "첫 수집 대기"];
  return ["on", "수집 중", `${n.interval_min || "?"}분마다`];
}

export function useCreateNode() {
  const qc = useQueryClient();
  const { pickNode, setPanelMsg } = useUi();
  return useMutation({
    mutationFn: (name: string) => send<NodeWithKey>("/api/nodes", { name }),
    onSuccess: async (made) => {
      await qc.invalidateQueries({ queryKey: ["nodes"] });
      pickNode(made.name);
      setPanelMsg("✓ 노드를 등록하고 키를 발급했습니다");
    },
    onError: (e) => setPanelMsg(e.message),
  });
}

export type NodeAct = "key" | "on" | "off";

export function useNodeAction() {
  return usePanelAction(async ({ name, action }: { name: string; action: NodeAct }) => {
    const base = `/api/nodes/${encodeURIComponent(name)}`;
    if (action === "key") {
      await send(`${base}/key`, {});
      return "✓ 키를 새로 발급했습니다. 그 서버의 node.conf 를 바꾸세요";
    }
    await send(base, { enabled: action === "on" }, "PATCH");
    return action === "on" ? "✓ 노드를 켰습니다" : "✓ 노드를 껐습니다";
  }, ["nodes"]);
}
