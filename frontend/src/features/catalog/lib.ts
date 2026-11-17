import type { QueueItem } from "@/app/queue/types";
import type { AccessItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

// 목록 한 줄 — 이름 아래 코드, 분류 아래 설명, 업무 시스템은 배지 칸. 켜진 권한만 일반 사용자가 신청함
export const accessItem = (a: AccessItem): QueueItem => ({
  type: "access", key: `access:${a.code}`, id: a.code, badge: a.system ? { icon: "server", text: a.system } : undefined,
  who: a.name, what: a.category || "—", note: a.description || undefined, when: stamp(a.updated_at),
  judge: accessState(a.is_active), raw: a,
});

export const accessState = (on: boolean): string => (on ? "신청 가능" : "신청 막힘");
