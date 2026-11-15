import { useState, type ReactNode } from "react";
import { DECISIONS, DECISION_SET, decisionState, decisionTone, useDecide, type DecisionTarget } from "./decision";
import { PanelMsg } from "./Panel";
import type { Decision, Level } from "@/shared/api/types";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { Icon } from "@/shared/ui/base/Icon";
import { stamp } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Meta } from "@/shared/ui/base/parts";
import { input, levelText, panelFoot, panelFootTitle } from "@/shared/ui/base/styles";

const STATE_LABEL = "text-[11.5px] font-semibold text-ink-dim";

// AI 판정과 사람의 처리 상태를 나란히 따로 둡니다.
export function JudgeState({ level, label, children }: { level: Level | null | undefined; label?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-1 rounded-lg border border-line px-3 py-2">
        <span className={STATE_LABEL}>AI 판단</span>
        <b className={cn("flex items-center gap-1.5 text-[15px]", level && levelText[level])}><Icon name={(level && LEVEL_ICON[level]) || "warn"} className="size-4.5" />{label ?? (level || "판정 실패")}</b>
      </div>
      <div className="flex flex-col items-start gap-1 rounded-lg border border-line px-3 py-2">
        <span className={STATE_LABEL}>처리 상태</span>
        {children}
      </div>
    </div>
  );
}

export function DecisionBadge({ decision }: { decision: Pick<Decision, "action"> | null | undefined }) {
  const s = decisionState(decision);
  return <span className={cn("inline-flex items-center rounded-full border border-solid px-2 py-0.25 text-[12px] font-bold whitespace-nowrap", s.tone)}>{s.text}</span>;
}

export function DecisionFoot({ target, decision }: { target: DecisionTarget; decision: Decision | null | undefined }) {
  const decide = useDecide();
  const [comment, setComment] = useState("");
  const act = (action: string) => decide.mutate({ target, action, comment }, { onSuccess: () => setComment("") });
  const choices = Object.entries(DECISION_SET[target.kind]);
  return (
    <div className={panelFoot}>
      <h4 className={panelFootTitle}>처리</h4>
      <textarea className={cn(input, "min-h-14 resize-y")} id="review-comment" maxLength={2000} placeholder="결정 의견 (선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
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
