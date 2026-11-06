import type { NodeRow } from "@/shared/api/types";

export type NodeStateClass = "off" | "wait" | "stale" | "on";

export const nodeStateTone: Record<NodeStateClass, string> = { on: "text-ok", stale: "text-warn", off: "text-ink-dim", wait: "text-ink-dim" };
export const nodeStateText = "whitespace-nowrap text-[12px] font-bold";
export const nodeActions = "mt-2.5 flex flex-wrap gap-2";

// 꺼짐 · 키 없음 · 끊김 · 기다리는 중 · 수집 중 순서로 봅니다.
export function nodeState(n: NodeRow): [NodeStateClass, string, string] {
  if (!n.enabled) return ["off", "꺼짐", "수집, 점검 안 함"];
  if (!n.key_issued) return ["wait", "키 없음", "키를 발급하세요"];
  if (n.stale) return ["stale", "끊김", n.interval_min ? `${n.interval_min * 3}분 넘게 소식 없음` : "소식 없음"];
  if (!n.last_collected_at) return ["wait", "기다리는 중", "첫 수집 대기"];
  return ["on", "수집 중", `${n.interval_min || "?"}분마다`];
}
