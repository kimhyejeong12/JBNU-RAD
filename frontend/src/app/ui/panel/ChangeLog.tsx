import { useQuery } from "@tanstack/react-query";
import { auditQuery } from "@/shared/api/queries";
import type { AuditTarget } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { AUDIT_ACTION, changeText } from "@/shared/lib/labels";
import { History, Section } from "@/shared/ui/base/parts";
import { note } from "@/shared/ui/base/styles";

// 감사 기록에서 읽은 한 대상의 변경 이력입니다 — 판정의 근거가 언제 누구 손으로 바뀌었는지 보입니다.
export function ChangeLog({ type, id, rev }: { type: AuditTarget; id: string; rev: string | number }) {
  const q = useQuery(auditQuery(type, id, rev));
  const rows = q.data ?? [];
  return (
    <Section icon="list" title="변경 이력">
      {rows.length
        ? <History steps={rows.map((r) => ({ title: AUDIT_ACTION[r.action] ?? r.action, who: r.by, when: stamp(r.at), say: changeText(r) }))} />
        : <p className={note}>{q.isLoading ? "읽는 중…" : q.isError ? q.error.message : "기록 없음"}</p>}
    </Section>
  );
}
