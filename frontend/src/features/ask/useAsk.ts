import { useQueryClient } from "@tanstack/react-query";
import { ASK } from "./config";
import { useQa } from "@/app/session/data";
import { errorText, send } from "@/shared/api/http";
import type { AskAnswer, AskItem, AskKind } from "@/shared/api/types";

// 질의 보내기 — 기다리는 항목을 먼저 캐시에 넣어 탭을 떠나도 남고, 답이 오면 같은 항목을 바꿉니다.
export function useAsk(kind: AskKind) {
  const qc = useQueryClient();
  const list = useQa(kind);
  const busy = list.some((m) => m.started);
  const key = ["qa", kind];

  async function run(id: string, q: string) {
    let result: Partial<AskItem>;
    try {
      result = { ...(await send<AskAnswer>(ASK[kind].url, { question: q })), started: null };
    } catch (e) {
      result = { answer: `질의 실패: ${errorText(e)}`, sources: [], failed: true, started: null };
    }
    qc.setQueryData<AskItem[]>(key, (old = []) => old.map((m) => (m.id === id ? { ...m, ...result } : m)));
  }

  // 받아들였으면 바로 true 를 돌려주어 입력 칸을 비울 수 있게 합니다. 답은 캐시로 옵니다.
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
