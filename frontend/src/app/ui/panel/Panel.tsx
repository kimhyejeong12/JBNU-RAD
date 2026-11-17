import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUi } from "@/app/ui/state/UiContext";
import { panelOnDemand } from "@/app/ui/state/uiReducer";
import { cn } from "@/shared/lib/cn";
import { card, note, panelBody, panelFoot, cardTitle, msgTone } from "@/shared/ui/styles";
import { auditQuery } from "@/shared/api/queries";
import type { AuditTarget } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { AUDIT_ACTION, changeText } from "@/shared/lib/labels";
import { History, Section } from "@/shared/ui/parts";

// 오른쪽 패널 틀 — 머리 상자(제목 · 버튼) 하나, 내용과 아래 칸(foot)을 묶은 상자 하나. 모든 패널이 씁니다.
export function Panel({ title, actions, foot, children }: { title: ReactNode; actions?: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <>
      <PanelHead title={title}>{actions}</PanelHead>
      <div className={cn(card, "mt-3 flex min-h-0 flex-1 flex-col overflow-hidden")}>
        <div className={panelBody}>{children}</div>
        {foot}
      </div>
    </>
  );
}

function PanelHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const { closePanel, ui } = useUi();
  return (
    // 높이를 정해 두어 버튼이 있는 머리와 없는 머리가 같습니다.
    <div className={cn(card, "flex h-12 flex-none items-center gap-2.5 px-4.5")}>
      <h3 className={cardTitle}>{title}</h3>
      {children}
      <button aria-label="닫기" onClick={closePanel}
        className={cn("hidden border-none bg-transparent px-1 py-0 text-[22px] leading-none text-ink-dim hover:text-ink narrow:block", panelOnDemand(ui.mainTab) && "block", children ? "ml-1" : "ml-auto")}>
        ×
      </button>
    </div>
  );
}

// "✓" 로 시작하면 완료(초록), 아니면 오류입니다.
export function PanelMsg() {
  const { ui } = useUi();
  if (!ui.panelMsg) return null;
  return <p className={cn(msgTone(ui.panelMsg), "my-[1em]")}>{ui.panelMsg}</p>;
}

export function PanelFoot({ note: text }: { note?: ReactNode }) {
  const { ui } = useUi();
  if (!ui.panelMsg && !text) return null;
  return <div className={panelFoot}>{ui.panelMsg ? <PanelMsg /> : <p className={note}>{text}</p>}</div>;
}

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
