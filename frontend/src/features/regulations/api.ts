import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUi } from "@/app/ui/state/UiContext";
import { send } from "@/shared/api/http";
import type { Regulation } from "@/shared/api/types";

// 기준 문서 올리기 — 파일 글자를 읽어 보내고, 목록을 다시 받은 뒤 새 문서를 고릅니다.
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
