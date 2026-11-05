import type { AskStep } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

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
export function criteriaText(c: Record<string, string> | null | undefined, none = "조건 없음 (전체)"): string {
  const parts = Object.entries(c || {}).map(([k, v]) =>
    `${CRITERIA_LABEL[k] || k} ${k === "since" || k === "until" ? stamp(v) : k === "kind" ? KIND_LABEL[v] ?? v : v}`);
  return parts.length ? parts.join(" · ") : none;
}

export const toolLabel = (s: AskStep): string => TOOLS[s.tool]?.label ?? s.tool;
export const toolIcon = (s: AskStep): string => TOOLS[s.tool]?.icon ?? "file";

// 칩 한 줄 — "로그 48건 · 사용자 재무 정다은 · 행위 출력"
export function stepText(s: AskStep): string {
  if (s.error) return `${toolLabel(s)} · 실패`;
  const c = criteriaText(s.criteria, "");
  return [s.summary, c].filter(Boolean).join(" · ");
}
