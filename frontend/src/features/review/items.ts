import type { QueueItem } from "@/app/queue/types";
import type { Results } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

// 정책 · 서버 · 로그 결정은 권한 DB에 남고 /api/results 의 decisions 로 함께 옵니다.
const decisionOf = (r: Results, kind: string, key: string) => r.decisions?.[kind]?.[key];

export function policyItems(r: Results): QueueItem[] {
  return (r.policy_review?.issues ?? []).map((i, n) => ({
    type: "policy", key: `policy:${i.key}`, itemKey: i.key, id: `ISSUE-${n + 1}`, level: i.level,
    decision: decisionOf(r, "policy", i.key),
    who: (i.policy_ids || []).join(" ↔ "),
    what: `${i.kind} — ${i.reason}`,
    when: stamp(r.sections?.policies?.generated_at),
    judge: i.level, raw: i,
  }));
}

// 서버 점검은 정책 관리 검토와 함께 돌아 같은 메뉴에 둡니다. 결정 버튼은 로그 감시처럼 이상 없음 · 조치 필요입니다.
export function serverItems(r: Results): QueueItem[] {
  return (r.servers ?? []).map((s) => {
    const gaps = s.gaps ?? [];
    return {
      type: "server", key: `server:${s.key}`, itemKey: s.key, id: s.id, level: s.level,
      decision: decisionOf(r, "server", s.key),
      who: s.title,
      what: gaps.length ? `정책과 다른 곳 ${gaps.length} — ${s.reason}` : s.reason,
      when: stamp(r.sections?.servers?.generated_at),
      judge: s.level, raw: s,
    };
  });
}

export function eventItems(r: Results): QueueItem[] {
  return (r.events ?? []).map((f) => {
    const lines = (f.detail?.events || "").split("\n").filter(Boolean);
    return {
      type: "event", key: `event:${f.key}`, itemKey: f.key, id: `LOG-${f.id.split("@")[0]}`, level: f.level,
      decision: decisionOf(r, "event", f.key),
      who: f.title,
      what: `로그 ${lines.length}건 — ${f.reason}`,
      when: stamp(f.detail?.last_event_at),
      // 빠른 감시(생각 없이)의 1차 판정 — 정밀 감시가 같은 구간을 다시 판정하면 목록에서 빠지고 확정 판정이 뜹니다.
      sub: f.stage === "fast" ? "1차 판정 · 확정 대기" : "",
      judge: f.level, raw: f,
    };
  });
}
