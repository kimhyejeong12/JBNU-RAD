import type { QueueItem } from "./types";
import { TYPE_VIEW, VIEWS, type View } from "@/app/views";
import type { LevelFilter, StageFilter } from "@/app/ui/uiReducer";
import type { Role } from "@/shared/api/types";
import { STEP, isActive } from "@/shared/lib/request";

export function inView(it: QueueItem, view: View, stageFilter: StageFilter, role: Role): boolean {
  if (TYPE_VIEW[it.type] !== view) return false;
  // 결재함은 기본으로 내 단계에서 기다리는 신청만 보여줍니다. 유효 권한(예전 권한 현황)도 같은 목록의 거르기입니다.
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
    const raw = it.raw as { reason?: string | null; recommendation?: string | null; policy_ids?: string[] };
    const hay = [it.id, it.who, it.what, it.judge, raw.reason, raw.recommendation, ...(raw.policy_ids || [])].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

// 종 배지: 내가 결재할 위험 신청 + 결정하지 않은 정책 · 서버 · 로그 위험.
export function openRisks(items: QueueItem[], role: Role): QueueItem[] {
  if (role === "user") return [];
  return items.filter((it) => it.level === "위험" && (
    it.type === "req" ? it.raw.stage === STEP[role] : (it.type === "policy" || it.type === "server" || it.type === "event") && !it.decision));
}

// 메뉴별 건수 — 질의 메뉴처럼 목록이 없는 메뉴는 건수를 달지 않습니다.
export function viewCounts(items: readonly QueueItem[], views: View[], stageFilter: StageFilter, role: Role): Record<string, number> {
  const n: Record<string, number> = {};
  for (const v of views) {
    if (VIEWS[v].tabs.includes("queue")) n[v] = items.filter((it) => inView(it, v, stageFilter, role)).length;
  }
  return n;
}

export const firstKeyInView = (items: QueueItem[], view: View, stageFilter: StageFilter, role: Role): string | null =>
  items.find((it) => inView(it, view, stageFilter, role))?.key ?? null;
