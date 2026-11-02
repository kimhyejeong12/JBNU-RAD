import type { QueueItem } from "@/app/queue/types";
import type { Results } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

export const DECISIONS: Record<string, string> = { approve: "승인", cond: "조건부 승인", reject: "반려 확정", clear: "이상 없음", act: "조치 필요" };

// 로그 감시 · 서버 점검은 승인할 대상이 아니라 확인할 대상이라 결정 버튼이 다릅니다. 값은 버튼 색(decisionTone 의 키)입니다.
export type DecisionColor = "approve" | "cond" | "reject";
export const DECISION_SET: Record<string, Record<string, DecisionColor>> = {
  policy: { approve: "approve", cond: "cond", reject: "reject" },
  event: { clear: "approve", act: "reject" },
  server: { clear: "approve", act: "reject" },
};

// 결정 버튼 색 — 승인 · 이상 없음은 초록, 조건부는 주의 색, 반려 · 조치 필요는 빨강.
export const decisionTone: Record<DecisionColor, string> = {
  approve: "border-ok-line bg-ok-tint text-ok",
  cond: "border-warn-line bg-warn-tint text-warn-ink",
  reject: "border-risk bg-risk text-white",
};

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

// 판정한 로그 한 줄 — 엔진이 만든 모양(data/types.py SecurityEvent.describe): "- 날짜 시각 UTC [솔루션] 부서 이름(IP) — 위치 / 행위 / 항목".
const LOG_LINE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC (\[[^\]]*\] .+?\)) — (.*)$/;

// 판정한 로그를 줄입니다 — 줄마다 같은 "[솔루션] 부서 이름(IP)"는 머리로 한 번만 빼고, 시각은 다른 화면처럼 한국 시간으로.
// 사람이 섞이거나 줄 모양이 다르면(엔진이 모양을 바꾼 경우) 원문 그대로 둡니다.
export function compactLog(text: string): { head: string | null; lines: string[] } {
  const raw = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed = raw.map((l) => LOG_LINE.exec(l)).filter((m): m is RegExpExecArray => m !== null);
  const head = parsed[0]?.[3];
  if (!head || parsed.length !== raw.length || parsed.some((m) => m[3] !== head)) return { head: null, lines: raw.map((l) => l.replace(/^- /, "")) };
  return { head, lines: parsed.map((m) => `${stamp(`${m[1]}T${m[2]}Z`)} — ${m[4]}`) };
}
