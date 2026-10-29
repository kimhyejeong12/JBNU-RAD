import { DECISIONS } from "./lib";
import type { ReviewItem } from "./api";
import type { Decision } from "@/shared/api/types";
import { person, stamp } from "@/shared/lib/format";
import { History, Section } from "@/shared/ui/parts";

// 보안 총책임자에게만 결정 기록 전부가 옵니다 (decision_log). 누가 어떤 판단을 했다가 취소했는지까지 읽습니다.
export function DecisionLog({ log, it }: { log: Record<string, Record<string, Decision[]>>; it: ReviewItem }) {
  const rows = log[it.type]?.[it.itemKey!] ?? [];
  const steps = rows.map((d) => ({
    title: d.action === "cancel" ? "결정 취소" : DECISIONS[d.action],
    who: person(d.decider_name, d.decider_department),
    when: `${stamp(d.decided_at)}${d.ai_level ? ` · 그때 AI 판정 ${d.ai_level}` : ""}`,
    say: d.comment,
  }));
  return (
    <Section icon="list" title="결정 기록">
      {steps.length ? <History steps={steps} /> : <p className="note">아직 결정이 없습니다.</p>}
    </Section>
  );
}
