import { DECISIONS } from "./lib";
import type { ReviewItem } from "./api";
import type { Decision } from "@/shared/api/types";
import { person, stamp } from "@/shared/lib/format";
import { History, Section } from "@/shared/ui/base/parts";
import { note } from "@/shared/ui/base/styles";

// 결정을 이어받은 판정은 자기 기록이 없어 지난 판정의 기록을 보여줍니다.
export function DecisionLog({ log, it }: { log: Record<string, Record<string, Decision[]>>; it: ReviewItem }) {
  const from = it.decision?.carried_from;
  const rows = log[it.type]?.[it.itemKey!] ?? (from ? log[it.type]?.[from] : undefined) ?? [];
  const steps = rows.map((d) => ({
    title: d.action === "cancel" ? "결정 취소" : DECISIONS[d.action],
    who: person(d.decider_name, d.decider_department),
    when: stamp(d.decided_at),
    say: d.comment,
  }));
  return (
    <Section icon="list" title={from ? "결정 기록 (이어받은 지난 판정)" : "결정 기록"}>
      {steps.length ? <History steps={steps} /> : <p className={note}>아직 결정이 없습니다.</p>}
    </Section>
  );
}
