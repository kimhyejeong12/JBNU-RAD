import type { QueueItem } from "@/app/queue/types";
import type { Decision, Regulation, Results } from "@/shared/api/types";
import { clauseHead } from "@/shared/lib/clause";
import { points, stamp } from "@/shared/lib/format";

const decisionOf = (r: Results, kind: string, key: string) => r.decisions?.[kind]?.[key];

const DOC = /\[?([^\s[\]]+)\.(md|txt)\]?/;

// 정책 문제의 대상 — 조항 번호 · 제목(원문에 없으면 문서 이름을 뺀 번호)과 문서 이름(확장자 없이, 한 번씩)
export function policyTarget(ids: string[], regulations: Regulation[]): { who: string; docs: string } {
  const heads = ids.map((id) => clauseHead(id, regulations));
  const who = ids.map((id, n) => heads[n]?.title ?? (id.replace(DOC, "").trim() || id)).join(" ↔ ");
  const docs = [...new Set(ids.map((id, n) => heads[n]?.doc ?? id.match(DOC)?.[1]).filter(Boolean))].join(", ");
  return { who, docs };
}

// 대상은 조항 제목으로 줄이고, 아래 줄에 유형 · 문서 이름 — 검색은 원래 policy_ids 로도 됨(select.ts)
export function policyItems(r: Results, regulations: Regulation[] = []): QueueItem[] {
  return (r.policy_review?.issues ?? []).map((i) => {
    const t = policyTarget(i.policy_ids || [], regulations);
    return {
      type: "policy", key: `policy:${i.key}`, itemKey: i.key, id: "", level: i.level,
      typeLabel: t.docs ? `정책 문제 — ${t.docs}` : "정책 문제",
      decision: decisionOf(r, "policy", i.key),
      who: t.who,
      lead: i.kind, what: i.reason,
      when: stamp(r.sections?.policies?.generated_at),
      judge: i.level, raw: i,
    };
  });
}

export function serverItems(r: Results): QueueItem[] {
  return (r.servers ?? []).map((s) => {
    const gaps = s.gaps ?? [];
    return {
      type: "server", key: `server:${s.key}`, itemKey: s.key, id: s.id, level: s.level,
      decision: decisionOf(r, "server", s.key),
      who: s.title,
      lead: gaps.length ? `다른 곳 ${gaps.length}` : undefined, what: s.reason,
      when: stamp(r.sections?.servers?.generated_at),
      judge: s.level, raw: s,
    };
  });
}

export function eventItems(r: Results): QueueItem[] {
  return (r.events ?? []).map((f) => {
    const lines = (f.detail?.events || "").split("\n").filter(Boolean);
    const facts = logFacts(f.detail?.events || "");
    return {
      type: "event", key: `event:${f.key}`, itemKey: f.key, id: `LOG-${f.id.split("@")[0]}`, level: f.level,
      decision: decisionOf(r, "event", f.key),
      who: f.title,
      // 행위 요약 — 위는 로그에서 센 행위별 수, 아래는 AI 이유의 첫 요점(소제목이 있으면 소제목)
      what: facts ? countText(facts.acts) : `로그 ${lines.length}건`,
      note: firstPoint(f.reason),
      when: stamp(f.detail?.last_event_at),
      // 정밀 감시가 같은 구간을 다시 판정하면 1차 판정은 목록에서 빠짐
      sub: f.stage === "fast" ? "1차 판정" : "",
      judge: f.level, raw: f,
    };
  });
}

// 엔진이 만든 모양(SecurityEvent.describe): "- 날짜 시각 UTC [솔루션] 부서 이름(IP) — 위치 / 행위 / 항목"
const LOG_LINE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC (\[[^\]]*\] .+?\)) — (.*)$/;

// 사람이 섞이거나 줄 모양이 다르면(엔진이 모양을 바꾼 경우) 원문 그대로 둠
export function compactLog(text: string): { head: string | null; lines: string[] } {
  const raw = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed = raw.map((l) => LOG_LINE.exec(l)).filter((m): m is RegExpExecArray => m !== null);
  const head = parsed[0]?.[3];
  if (!head || parsed.length !== raw.length || parsed.some((m) => m[3] !== head)) return { head: null, lines: raw.map((l) => l.replace(/^- /, "")) };
  return { head, lines: parsed.map((m) => `${stamp(`${m[1]}T${m[2]}Z`)} — ${m[4]}`) };
}

export interface LogFacts { head: string; first: string; last: string; count: number; acts: [string, number][]; places: [string, number][] }

// 판정한 로그에서 센 사실 — 행위 · 위치별 수와 기간. 줄 모양이 다르면 null (compactLog 와 같은 조건)
export function logFacts(text: string): LogFacts | null {
  const raw = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed = raw.map((l) => LOG_LINE.exec(l)).filter((m): m is RegExpExecArray => m !== null);
  const head = parsed[0]?.[3];
  if (!head || parsed.length !== raw.length || parsed.some((m) => m[3] !== head)) return null;
  const tally = (at: number): [string, number][] => {
    const n = new Map<string, number>();
    for (const m of parsed) {
      const k = m[4].split(" / ")[at]?.trim();
      if (k) n.set(k, (n.get(k) ?? 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1]);
  };
  const times = parsed.map((m) => `${m[1]}T${m[2]}Z`).sort();
  return { head, first: stamp(times[0]), last: stamp(times[times.length - 1]), count: parsed.length, acts: tally(1), places: tally(0) };
}

// AI 이유의 첫 요점 — 모델이 단 소제목이 있으면 그것, 없으면 첫 문장
export function firstPoint(reason: string): string {
  const p = points(reason)[0];
  return p ? p.label || p.text : "";
}

// 예: "출력행위 20건, 조회 3건"
export const countText = (xs: [string, number][]): string => xs.map(([k, n]) => `${k} ${n}건`).join(", ");

export type DecisionLogMap = Record<string, Record<string, Decision[]>>;

// 한 판정의 결정 기록 — 결정을 이어받은 판정은 자기 기록이 없어 지난 판정의 기록임
export function logRows(log: DecisionLogMap, it: { type: string; itemKey?: string; decision?: Pick<Decision, "carried_from"> | null }): Decision[] {
  const from = it.decision?.carried_from;
  return log[it.type]?.[it.itemKey ?? ""] ?? (from ? log[it.type]?.[from] : undefined) ?? [];
}

export type ReviewItem = Extract<QueueItem, { type: "policy" | "server" | "event" }>;
