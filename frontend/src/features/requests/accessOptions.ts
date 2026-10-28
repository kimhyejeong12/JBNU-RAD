import type { AccessItem, RequestRow } from "@/shared/api/types";
import { isActive } from "@/shared/lib/request";

export interface AccessOptions {
  groups: [system: string, items: AccessItem[]][];
  reason: Record<string, string>;   // 고를 수 없는 권한의 이유 (보유 중 · 결재 중)
  value: string;                    // 앞 선택이 막히지 않았으면 그대로
  empty: boolean;                   // 켜진 권한이 하나도 없음
}

// 신청서의 고르기 칸 — 권한 목록의 켜진 권한을 시스템별로 묶고, 보유 중 · 결재 중인 권한은 막습니다.
export function accessOptions(catalog: AccessItem[], mine: RequestRow[], prev: string): AccessOptions {
  const held = new Set(mine.filter((r) => isActive(r)).map((r) => r.access_code));
  const pending = new Set(mine.filter((r) => r.stage === "manager" || r.stage === "top").map((r) => r.access_code));
  const items = catalog.filter((a) => a.is_active);
  const groups = new Map<string, AccessItem[]>();
  const reason: Record<string, string> = {};
  for (const a of items) {
    const sys = a.system || "기타";
    if (!groups.has(sys)) groups.set(sys, []);
    groups.get(sys)!.push(a);
    if (held.has(a.code)) reason[a.code] = "보유 중";
    else if (pending.has(a.code)) reason[a.code] = "결재 중";
  }
  return {
    groups: [...groups],
    reason,
    value: prev && !held.has(prev) && !pending.has(prev) ? prev : "",
    empty: !items.length,
  };
}
