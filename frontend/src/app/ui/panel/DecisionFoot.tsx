import { useState } from "react";
import { DECISIONS, DECISION_SET, decisionState, decisionTone, useDecide, type DecisionTarget } from "./decision";
import { PanelMsg } from "./Panel";
import type { Decision } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Meta, Pill } from "@/shared/ui/parts";
import { input, panelFoot, panelFootTitle, squarePill } from "@/shared/ui/styles";

// 표의 처리 상태 칸 — 배지만, 누가 · 언제는 패널 (검토 현황 · 종합 대시보드)
export function StateCell({ text, tone }: { text: string; tone: string }) {
  return (
    <span className="flex min-w-0 flex-col items-start">
      <Pill tone={tone} className={cn("block max-w-full truncate", squarePill)}>{text}</Pill>
    </span>
  );
}

// 표의 처리 상태 칸 — 결정 없음은 글만, 결정이 있으면 배지 (종합 대시보드 · 보안 현황)
export function DecisionCell({ decision }: { decision: Pick<Decision, "action"> | null | undefined }) {
  const s = decisionState(decision);
  return decision ? <StateCell {...s} /> : <span className="whitespace-nowrap text-ink-dim">{s.text}</span>;
}

export function DecisionBadge({ decision }: { decision: Pick<Decision, "action"> | null | undefined }) {
  const s = decisionState(decision);
  return <Pill tone={s.tone} className={squarePill}>{s.text}</Pill>;
}

export function DecisionFoot({ target, decision }: { target: DecisionTarget; decision: Decision | null | undefined }) {
  const decide = useDecide();
  const [comment, setComment] = useState("");
  const act = (action: string) => decide.mutate({ target, action, comment }, { onSuccess: () => setComment("") });
  const choices = Object.entries(DECISION_SET[target.kind]);
  return (
    <div className={panelFoot}>
      <h4 className={panelFootTitle}>처리</h4>
      <textarea className={cn(input, "h-10 min-h-10 resize-y")} rows={1} id="review-comment" maxLength={2000} placeholder="결정 의견 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-2 grid grid-flow-col auto-cols-fr gap-2">
        {choices.map(([a, color]) => (
          <button key={a} aria-pressed={decision?.action === a} onClick={() => act(a)} disabled={decide.isPending}
            className={cn("h-9 rounded-lg border border-solid text-[13.5px] font-bold hover:brightness-[0.97] disabled:opacity-60 aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ink", decisionTone[color])}>
            {DECISIONS[a]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-dim">
        {decision ? (
          <>
            <span className="min-w-0 flex-1">
              <Meta items={[<b key="a" className="text-ink">{DECISIONS[decision.action]}</b>, decision.decider_name, stamp(decision.decided_at),
                decision.carried_from && "이전 결정"]} />
              {decision.comment && <span className="block">{decision.comment}</span>}
            </span>
            <button id="undo" onClick={() => act("cancel")} className="shrink-0 self-start border-none bg-transparent p-0 text-[12px] whitespace-nowrap text-ink-dim underline">취소</button>
          </>
        ) : null}
      </div>
      <PanelMsg />
    </div>
  );
}
