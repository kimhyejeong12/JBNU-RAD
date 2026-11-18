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
  query: { label: "권한 DB", icon: "db" },
};

const CRITERIA_LABEL: Record<string, string> = {
  nodes: "노드", module: "모듈", user: "사용자", department: "부서", solution: "솔루션", where: "위치", how: "행위", keyword: "항목",
  since: "부터", until: "까지", query: "찾은 말", who: "사람", kind: "종류",
};
const KIND_LABEL: Record<string, string> = { events: "로그 감시", policies: "정책 관리 검토", suspects: "위협 예측" };

// 근거는 도구가 조건으로 찾은 것이라 조건을 함께 보여줌
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
  empty: "무엇을 도와드릴까요?",
};

// 빈 대화의 분류별 예시 질문 — 도구가 찾을 수 있는 곳으로 나누고, 실제 데이터에서도 통하게 사람 이름 · 기간은 넣지 않음
export const ASK_TOPICS: { label: string; icon: string; questions: string[] }[] = [
  { label: "기준 문서", icon: "book", questions: ["급여 정보에 접근할 수 있는 기준은?", "방화벽 정책을 만들 때 지킬 원칙은?", "개인 클라우드 업로드는 기준상 허용돼?"] },
  { label: "권한", icon: "key", questions: ["급여 테이블 권한을 가진 사람은?", "사용 기간이 곧 끝나는 권한은?", "AI가 위험으로 봤는데 승인된 신청은?"] },
  { label: "로그", icon: "search", questions: ["예외 승인된 출력 기록은?", "출력을 가장 많이 한 사람은?", "솔루션별 로그 건수는?"] },
  { label: "서버", icon: "server", questions: ["SSH 루트 로그인이 열린 서버는?", "방화벽에 문제가 있는 서버는?", "최근 설정이 바뀐 서버는?"] },
  { label: "AI 판정", icon: "eye", questions: ["위험 판정을 받은 사람은?", "의심 점수가 높은 사람은?", "정책 관리 검토에서 나온 문제는?"] },
];

// 기다리는 항목을 먼저 캐시에 넣어 탭을 떠나도 남게 함
export function useAsk(conversation: string) {
  const qc = useQueryClient();
  const list = useConversation(conversation);
  const busy = list.some((m) => m.started);
  const key = ["qa", conversation];

  async function run(id: string, q: string) {
    let result: Partial<AskItem>;
    try {
      // 서버가 주는 기록 번호(id)는 쓰지 않음 — 화면이 붙인 id 를 그대로 둬야 목록의 줄이 바뀌지 않음
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
