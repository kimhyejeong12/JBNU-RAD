import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useUi } from "./UiContext";

// 패널에서 하는 동작 — 성공 문구는 동작이 돌려주고, 오류는 서버 문장을 그대로 띄웁니다. 끝나면 그 목록을 다시 받아 서버 값으로 그립니다.
export function usePanelAction<V>(run: (v: V) => Promise<string>, refresh: QueryKey) {
  const qc = useQueryClient();
  const { setPanelMsg } = useUi();
  return useMutation({
    mutationFn: run,
    onSuccess: (msg) => setPanelMsg(msg),
    onError: (e) => setPanelMsg(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: refresh }),
  });
}
