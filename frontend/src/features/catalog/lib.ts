import type { QueueItem } from "@/app/queue/types";
import type { AccessItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

export const accessItem = (a: AccessItem): QueueItem => ({
  type: "access", key: `access:${a.code}`, id: "", typeLabel: a.system || "—",
  who: `${a.name} (${a.code})`, what: [a.category, a.description].filter(Boolean).join(" — ") || "—", when: stamp(a.updated_at),
  judge: a.is_active ? "켜짐" : "꺼짐", raw: a,
});
