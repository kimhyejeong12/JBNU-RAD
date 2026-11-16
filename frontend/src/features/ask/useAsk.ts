import { useQueryClient } from "@tanstack/react-query";
import { useConversation } from "@/app/session/data";
import { errorText, send } from "@/shared/api/http";
import type { AskAnswer, AskItem } from "@/shared/api/types";

// 기다리는 항목을 먼저 캐시에 넣어 탭을 떠나도 남게 합니다.
export function useAsk(conversation: string) {
  const qc = useQueryClient();
  const list = useConversation(conversation);
  const busy = list.some((m) => m.started);
  const key = ["qa", conversation];

  async function run(id: string, q: string) {
    let result: Partial<AskItem>;
    try {
      // 서버가 주는 기록 번호(id)는 쓰지 않습니다 — 화면이 붙인 id 를 그대로 둬야 목록의 줄이 바뀌지 않습니다.
      const { id: _recorded, ...answer } = await send<AskAnswer>("/api/ask", { question: q, conversation_id: conversation });
      result = { ...answer, started: null };
      void qc.invalidateQueries({ queryKey: ["qa", "list"], exact: true });
    } catch (e) {
      result = { answer: `질의 실패: ${errorText(e)}`, failed: true, started: null };
    }
    qc.setQueryData<AskItem[]>(key, (old = []) => old.map((m) => (m.id === id ? { ...m, ...result } : m)));
  }

  function ask(text: string): boolean {
    const q = text.trim();
    if (!q || busy) return false;
    const id = `ask-${Date.now()}`;
    qc.setQueryData<AskItem[]>(key, (old = []) => [...old, { id, q, started: Date.now() }]);
    void run(id, q);
    return true;
  }

  return { list, busy, ask };
}
