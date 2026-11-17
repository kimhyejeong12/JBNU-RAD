import { useQueryClient } from "@tanstack/react-query";
import { useConversation } from "@/app/session/data";
import type { AskStep, AskAnswer, AskItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { errorText, send } from "@/shared/api/http";

export const askWaitLabel = (startedAt: number, now: number): string => `답변 생성 중… ${Math.max(0, Math.round((now - startedAt) / 1000))}초`;

export const TOOLS: Record<string, { label: string; icon: string }> = {
  search_regulations: { label: "기준 문서", icon: "book" },
  find_logs: { label: "로그", icon: "search" },
  servers: { label: "서버", icon: "server" },
  person: { label: "사람", icon: "users" },
  findings: { label: "AI 판정", icon: "eye" },
};

const CRITERIA_LABEL: Record<string, string> = {
  nodes: "노드", module: "모듈", user: "사용자", department: "부서", solution: "솔루션", where: "위치", how: "행위", keyword: "항목",
  since: "부터", until: "까지", query: "찾은 말", who: "사람", kind: "종류",
};
const KIND_LABEL: Record<string, string> = { events: "로그 감시", policies: "정책 관리 검토", suspects: "위협 예측" };

// 근거는 도구가 조건으로 찾은 것이라 조건을 함께 보여줍니다.
export function criteriaText(c: Record<string, unknown> | null | undefined, none = "조건 없음 (전체)"): string {
  const parts = Object.entries(c || {}).map(([k, value]) => {
    const v = String(value);
    return `${CRITERIA_LABEL[k] || k} ${k === "since" || k === "until" ? stamp(v) : k === "kind" ? KIND_LABEL[v] ?? v : v}`;
  });
  return parts.length ? parts.join(", ") : none;
}

export const toolLabel = (s: AskStep): string => TOOLS[s.tool ?? ""]?.label ?? s.tool ?? "";
export const toolIcon = (s: AskStep): string => TOOLS[s.tool ?? ""]?.icon ?? "file";

// 칩 한 줄 — "로그 48건 (사용자 재무 정다은, 행위 출력)"
export function stepText(s: AskStep): string {
  if (s.error) return "실패";
  const c = criteriaText(s.criteria, "");
  return c ? `${s.summary} (${c})` : s.summary ?? "";
}

export const ASK = {
  placeholder: "무엇이든 물어보세요",
  empty: "기준 문서, 로그, 서버, 사람, AI 판정에서 찾아 답합니다.",
  examples: [
    "영업팀이 급여 테이블(HR_SALARY)에 접근해도 돼?",
    "재무 정다은이 출력을 몇 번 했어?",
    "SSH 루트 로그인이 열린 서버와 근거 조항은?",
    "예외 처리된 출력이 있었어?",
    "박민수가 받은 위험 판정과 걸린 조항은?",
    "지금 방화벽에 문제가 있는 서버는?",
  ],
};

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
