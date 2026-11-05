import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUi } from "@/app/ui/state/UiContext";
import { getJSON, send } from "@/shared/api/http";
import { regulationsQuery } from "@/shared/api/queries";
import type { Regulation } from "@/shared/api/types";

export function useUploadRegulation() {
  const qc = useQueryClient();
  const { selectSilent, setPanelMsg } = useUi();
  return useMutation({
    mutationFn: async (file: File) => send<Regulation>("/api/regulations", { name: file.name, content: await file.text() }),
    onSuccess: async (made) => {
      setPanelMsg(`✓ ${made.name} 를 올렸습니다`);
      await qc.invalidateQueries({ queryKey: ["regulations"] });
      selectSilent(`doc:${made.name}`);
    },
    onError: (e) => setPanelMsg(e.message),
  });
}

// cancel() 로 요청을 끊으면 서버도 기다리기를 멈춥니다.
export function useEditRegulation() {
  const qc = useQueryClient();
  const { setPanelMsg } = useUi();
  const ctrl = useRef<AbortController | null>(null);
  const mutation = useMutation({
    mutationFn: ({ name, content, reason }: { name: string; content: string; reason: string }) => {
      ctrl.current = new AbortController();
      return getJSON<Regulation>(`/api/regulations/${encodeURIComponent(name)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, reason }), signal: ctrl.current.signal,
      });
    },
    onSuccess: () => setPanelMsg("✓ 고쳤습니다. 이 문서만 다시 적재했습니다"),
    onError: (e) => {
      if (!ctrl.current?.signal.aborted) setPanelMsg(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["regulations"] }),
  });
  // 서버가 이미 적재를 시작했으면 끊어도 고쳐지므로 문서를 다시 받아 확인합니다.
  async function cancel(before: Regulation): Promise<boolean> {
    ctrl.current?.abort();
    const now = (await qc.fetchQuery({ ...regulationsQuery(), staleTime: 0 })).find((r) => r.name === before.name);
    const applied = !!now && now.content !== before.content;
    setPanelMsg(applied ? "이미 적재가 시작돼 고쳐졌습니다" : "✓ 고치기를 취소했습니다. 문서는 그대로입니다");
    return applied;
  }
  return { ...mutation, cancel };
}

export function useRemoveRegulation() {
  const qc = useQueryClient();
  const { selectSilent, setPanelMsg } = useUi();
  return useMutation({
    mutationFn: ({ name, reason }: { name: string; reason: string }) =>
      getJSON<{ name: string }>(`/api/regulations/${encodeURIComponent(name)}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["regulations"] });
      selectSilent(null);
    },
    onError: (e) => setPanelMsg(e.message),
  });
}
