import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUi } from "@/app/ui/UiContext";
import { usePanelAction } from "@/app/ui/usePanelAction";
import { send } from "@/shared/api/http";

// 노드 등록 — 키를 발급하고 그 노드를 고릅니다.
export function useCreateNode() {
  const qc = useQueryClient();
  const { pickNode, setPanelMsg } = useUi();
  return useMutation({
    mutationFn: (name: string) => send<{ name: string }>("/api/nodes", { name }),
    onSuccess: async (made) => {
      await qc.invalidateQueries({ queryKey: ["nodes"] });
      pickNode(made.name);
      setPanelMsg("✓ 노드를 등록하고 키를 발급했습니다");
    },
    onError: (e) => setPanelMsg(e.message),
  });
}

export type NodeAct = "key" | "on" | "off";

// 키 다시 발급(예전 키는 바로 무효) · 켜기 · 끄기.
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
