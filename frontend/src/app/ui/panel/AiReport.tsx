import type { ReactNode } from "react";
import type { Level } from "@/shared/api/types";
import { points, stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { box, card, levelText } from "@/shared/ui/base/styles";
import { SourceChips } from "./SourceChips";

const LEVEL_TINT: Record<Level, string> = { "정상": "bg-ok-tint", "주의": "bg-warn-tint", "위험": "bg-risk-tint" };
const CAPTION = "mt-2 mb-1 text-[11.5px] font-semibold text-ink-dim";

export interface AiFinding { level: Level; reason: string; recommendation?: string | null; sources?: string[] | null; judgedAt?: string | null }

// AI 판정을 네 질문으로 — 어떻게 판단 · 왜 · 어떤 규정 · 어떻게 처리. 판정을 보이는 패널이 모두 씁니다.
// wait = 판정이 없을 때 글, tip = 등급 옆 글, why = 이유 아래 덧붙일 것, how · lead = 마지막 칸 제목 · 권고 앞 굵은 글.
// what 을 주면(로그 감시) 첫 칸이 "무슨 일"이 되고 등급은 "왜" 제목 옆으로 갑니다.
// 근거 조항(sources)이나 권고가 없으면 그 칸을 빼고 번호를 당깁니다.
type StepRow = [string, ReactNode, ReactNode?];
export function AiReport({ itemKey, f, wait, tip, lead, why, what, how = "어떻게 처리하면 좋을까요?" }: {
  itemKey: string; f: AiFinding | null; wait?: ReactNode; tip?: string; lead?: ReactNode; why?: ReactNode; what?: ReactNode; how?: string;
}) {
  const badge = f && (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-bold", levelText[f.level], LEVEL_TINT[f.level])}>
      <Icon name={LEVEL_ICON[f.level]} small />{f.level}{tip && ` (${tip})`}
    </span>
  );
  const steps: StepRow[] = !f ? [] : [
    what ? ["무슨 일이 있었나요?", what] : ["AI가 어떻게 판단했나요?", <>
      {badge}
      {f.judgedAt && <span className="ml-2 text-[11.5px] text-ink-dim">{stamp(f.judgedAt)} 판정</span>}
    </>],
    ["왜 그렇게 판단했나요?", <><Points text={f.reason} />{why}</>, what ? badge : undefined],
    ...(f.sources !== undefined ? [["어떤 규정에 해당하나요?", <SourceChips key="rules" itemKey={itemKey} sources={f.sources} />] as StepRow] : []),
    ...(f.recommendation ? [[how, <Points key="how" text={f.recommendation} lead={lead} />] as StepRow] : []),
  ];
  return (
    <section className={cn(card, "mt-4.5 overflow-hidden")}>
      <h4 className="m-0 flex items-center gap-1.5 border-b border-line bg-canvas px-3 py-2 text-[13px] font-bold"><Icon name="bot" small />AI 분석 결과</h4>
      {!f ? <div className={cn(box, "m-3")}>{wait}</div> : (
        <div className="divide-y divide-line px-3">
          {steps.map(([title, body, side], i) => <Step key={title} n={i + 1} title={title} side={side}>{body}</Step>)}
        </div>
      )}
    </section>
  );
}

export const AiCaption = ({ children }: { children: ReactNode }) => <p className={CAPTION}>{children}</p>;

function Step({ n, title, side, children }: { n: number; title: string; side?: ReactNode; children: ReactNode }) {
  return (
    <div className="py-2.5">
      <h5 className="m-0 mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold">
        <span className="flex size-4.5 flex-none items-center justify-center rounded-full bg-canvas text-[10.5px] text-ink-dim">{n}</span>{title}{side}
      </h5>
      <div className="pl-6 text-[13px] leading-[1.55]">{children}</div>
    </div>
  );
}

// 항목이 둘 이상이면 글머리표 목록 — 모델이 단 소제목만 굵게 둡니다.
function Points({ text, lead }: { text: string; lead?: ReactNode }) {
  const list = points(text);
  if (list.length < 2) return <p className="m-0">{lead}{text}</p>;
  return (
    <>
      {lead && <p className="m-0 mb-0.5">{lead}</p>}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {list.map((p, i) => (
          <li key={i} className="relative pl-3 before:absolute before:left-0 before:text-ink-dim before:content-['•']">
            {p.label && <b>{p.label}: </b>}{p.text}
          </li>
        ))}
      </ul>
    </>
  );
}
