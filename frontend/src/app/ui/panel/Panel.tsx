import type { ReactNode } from "react";
import { useUi } from "@/app/ui/state/UiContext";
import { panelOnDemand } from "@/app/ui/state/uiReducer";
import { cn } from "@/shared/lib/cn";
import { card, formMsg, formMsgOk, note, panelBody, panelFoot } from "@/shared/ui/base/styles";

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
      <h3 className="m-0 text-[15.5px] font-bold">{title}</h3>
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
  return <p className={cn(ui.panelMsg.startsWith("✓") ? formMsgOk : formMsg, "my-[1em]")}>{ui.panelMsg}</p>;
}

export function PanelFoot({ note: text }: { note?: ReactNode }) {
  const { ui } = useUi();
  if (!ui.panelMsg && !text) return null;
  return <div className={panelFoot}>{ui.panelMsg ? <PanelMsg /> : <p className={note}>{text}</p>}</div>;
}
