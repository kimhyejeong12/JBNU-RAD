import type { View } from "@/app/session/views";
import type { AskKind } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

// 질의 탭은 메뉴를 따릅니다 — 정책 질의 메뉴는 기준 문서, 정책 관리는 수집 노드 서버, 로그 감시는 로그에 묻습니다.
export const askMode = (view: View | null): AskKind => (view === "events" ? "logs" : view === "policies" ? "servers" : "policy");

export const askWaitLabel = (startedAt: number, now: number): string => `답변 생성 중… ${Math.max(0, Math.round((now - startedAt) / 1000))}초`;

const CRITERIA_LABEL: Record<string, string> = {
  nodes: "노드", module: "모듈", user: "사용자", department: "부서", solution: "솔루션", where: "위치", how: "행위", keyword: "항목", since: "부터", until: "까지",
};

// 로그 질의의 근거는 모델이 고른 것이 아니라 서버가 조건으로 찾은 로그입니다. 조건을 함께 보여줍니다.
export function criteriaText(c: Record<string, string> | null | undefined): string {
  const parts = Object.entries(c || {}).map(([k, v]) => `${CRITERIA_LABEL[k] || k} ${k === "since" || k === "until" ? stamp(v) : v}`);
  return parts.length ? parts.join(" · ") : "조건 없음 (전체 로그)";
}

export const serverCriteriaText = (c: Record<string, string> | null | undefined): string =>
  criteriaText(c).replace("전체 로그", "모든 서버 · 전체 기록");
