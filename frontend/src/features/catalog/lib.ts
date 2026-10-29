import type { QueueItem } from "@/app/queue/types";
import type { AccessItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

// 권한 목록 한 줄 — 보안 총책임자에게만 (일반 사용자는 신청서의 고르기 칸으로만 봅니다).
export const accessItem = (a: AccessItem): QueueItem => ({
  type: "access", key: `access:${a.code}`, id: "", typeLabel: a.system || "—",
  who: `${a.name} (${a.code})`, what: [a.category, a.description].filter(Boolean).join(" — ") || "—", when: stamp(a.updated_at),
  judge: a.is_active ? "켜짐" : "꺼짐", raw: a,
});
