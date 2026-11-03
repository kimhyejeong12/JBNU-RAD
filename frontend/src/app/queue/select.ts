import type { QueueItem } from "./types";
import { TYPE_VIEW, VIEWS, type View, RESULT_VIEWS } from "@/app/session/views";
import type { LevelFilter, StageFilter } from "@/app/ui/state/uiReducer";
import type { Role, Jobs } from "@/shared/api/types";
import { STEP, isActive } from "@/shared/lib/request";
import { runKindLabel } from "@/shared/api/jobs";

export function inView(it: QueueItem, view: View, stageFilter: StageFilter, role: Role): boolean {
  if (TYPE_VIEW[it.type] !== view) return false;
  // 결재함은 기본으로 내 단계에서 기다리는 신청만 보여줍니다. 유효 권한(예전 권한 현황)도 같은 목록의 거르기입니다.
  // 확인할 사람 탭은 신청 대신 사람을 줄로 보여 줍니다 (같은 권한 신청 메뉴의 탭).
  if (stageFilter === "people") return it.type === "person";
  if (it.type === "person") return false;
  if (it.type === "req" && stageFilter === "pending") return it.raw.stage === STEP[role];
  if (it.type === "req" && stageFilter === "active") return isActive(it.raw);
  return true;
}

export interface VisibleOptions { view: View; stageFilter: StageFilter; role: Role; filter: LevelFilter; query: string }

export function visible(items: QueueItem[], o: VisibleOptions): QueueItem[] {
  const q = o.query.trim().toLowerCase();
  return items.filter((it) => {
    if (!inView(it, o.view, o.stageFilter, o.role)) return false;
    if (o.filter !== "전체" && it.level !== o.filter) return false;
    if (!q) return true;
    const raw = it.raw as { reason?: string | null; recommendation?: string | null; policy_ids?: string[]; content?: string };
    const hay = [it.id, it.who, it.what, it.judge, raw.reason, raw.recommendation, raw.content, ...(raw.policy_ids || [])].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

// 정책 관리 · 로그 감시는 결정하지 않은 주의 · 위험을 위로 — 결정한 판정도 목록에 남고 로그 감시는 30분마다 쌓여, 할 일이 그 사이에 묻히지 않게.
// 같은 무리 안의 순서는 그대로입니다 (sort 는 같은 값끼리 순서를 지킴). 권한 신청 · 관리 목록은 순서가 바뀌지 않습니다.
const waiting = (it: QueueItem) => (it.type === "policy" || it.type === "server" || it.type === "event") && !it.decision && (it.level === "주의" || it.level === "위험");
export const todoFirst = (items: QueueItem[]): QueueItem[] => [...items].sort((a, b) => Number(waiting(b)) - Number(waiting(a)));

// 종 배지: 내가 결재할 위험 신청 + 결정하지 않은 정책 · 서버 · 로그 위험.
export function openRisks(items: QueueItem[], role: Role): QueueItem[] {
  if (role === "user") return [];
  return items.filter((it) => it.level === "위험" && (
    it.type === "req" ? it.raw.stage === STEP[role] : (it.type === "policy" || it.type === "server" || it.type === "event") && !it.decision));
}

// 사이드바 숫자 = 그 메뉴에서 내가 처리할 일 — 고른 탭 · 거르기와 상관없이 늘 같은 기준 (메일의 안 읽은 수처럼).
// 권한 신청은 내 단계에서 결재를 기다리는 신청, 정책 관리 · 로그 감시는 아직 결정하지 않은 주의 · 위험(1차 판정은 결정할 수 없어 뺌).
// 통계 · 질의 · 기준 문서 · 관리는 할 일이 아니라 숫자를 달지 않습니다. 0이면 사이드바가 숫자를 숨깁니다.
const TODO: Partial<Record<View, (it: QueueItem, role: Role) => boolean>> = {
  requests: (it, role) => it.type === "req" && it.raw.stage === STEP[role],
  policies: (it) => (it.type === "policy" || it.type === "server") && (it.level === "주의" || it.level === "위험") && !it.decision,
  events: (it) => it.type === "event" && (it.level === "주의" || it.level === "위험") && !it.decision && it.raw.stage !== "fast",
};

export function todoCounts(items: readonly QueueItem[], views: View[], role: Role): Record<string, number> {
  const n: Record<string, number> = {};
  for (const v of views) {
    const todo = TODO[v];
    if (todo) n[v] = items.filter((it) => todo(it, role)).length;
  }
  return n;
}

// 결재함 거르기 버튼의 건수 — 버튼마다 붙여 다른 보기에 무엇이 있는지 눌러 보지 않고 알게 합니다.
export const stageCounts = (items: readonly QueueItem[], role: Role): Record<StageFilter, number> => ({
  pending: items.filter((it) => inView(it, "requests", "pending", role)).length,
  active: items.filter((it) => inView(it, "requests", "active", role)).length,
  people: items.filter((it) => inView(it, "requests", "people", role)).length,
  all: items.filter((it) => inView(it, "requests", "all", role)).length,
});

// 등급 거르기 버튼의 건수 — 지금 메뉴 · 결재 단계 범위에서 등급별과 전체 (예전 요약 카드의 숫자).
export function levelCounts(items: readonly QueueItem[], view: View, stage: StageFilter, role: Role): Record<LevelFilter, number> {
  const shown = items.filter((it) => inView(it, view, stage, role));
  const n = (l: LevelFilter) => shown.filter((it) => it.level === l).length;
  return { 전체: shown.length, 정상: n("정상"), 주의: n("주의"), 위험: n("위험") };
}

export const firstKeyInView = (items: QueueItem[], view: View, stageFilter: StageFilter, role: Role): string | null =>
  items.find((it) => inView(it, view, stageFilter, role))?.key ?? null;

// 빈 목록 문구 — 한 줄로 다음 할 일을 알려 줍니다.
export function emptyText(view: View, stageFilter: StageFilter, jobs: Jobs | null, anyInView: boolean): string {
  if (anyInView) return "조건에 맞는 항목이 없습니다.";
  if (view === "events") return "검토할 주의 · 위험 판정이 없습니다.";
  if (RESULT_VIEWS.has(view)) return `아직 ${VIEWS[view].label} 결과가 없습니다. 오른쪽 위 [${runKindLabel(jobs, view)}]을 누르세요.`;
  const byView: Partial<Record<View, string>> = {
    requests: { pending: "지금 결재할 신청이 없습니다.", active: "지금 유효한 권한이 없습니다.", people: "확인할 사람이 없습니다. 퇴사 · 이동이나 위험 · 주의인 신청 · 보유 권한이 생기면 여기에 모입니다.", all: "신청이 없습니다." }[stageFilter],
    users: "계정이 없습니다.",
    access: "등록한 권한이 없습니다. [권한 등록]으로 넣으세요.",
    docs: "기준 문서가 없습니다.",
  };
  return byView[view] ?? "";
}
