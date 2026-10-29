import type { NodeRow } from "@/shared/api/types";

export type NodeStateClass = "off" | "wait" | "stale" | "on";

// 노드 상태 — [CSS 클래스, 글자, 툴팁 설명]. 꺼짐 · 키 없음 · 끊김 · 기다리는 중 · 수집 중 순서로 봅니다.
export function nodeState(n: NodeRow): [NodeStateClass, string, string] {
  if (!n.enabled) return ["off", "꺼짐", "보내도 받지 않고 주기 점검에서도 빠집니다"];
  if (!n.key_issued) return ["wait", "키 없음", "손으로 넣은 수집뿐입니다. 키를 발급해 노드에 넣으면 직접 보낼 수 있습니다"];
  if (n.stale) return ["stale", "끊김", `${n.interval_min}분 간격인데 세 번 넘게 소식이 없습니다`];
  if (!n.last_collected_at) return ["wait", "기다리는 중", "키를 발급했지만 아직 받은 수집이 없습니다"];
  return ["on", "수집 중", `${n.interval_min || "?"}분마다`];
}
