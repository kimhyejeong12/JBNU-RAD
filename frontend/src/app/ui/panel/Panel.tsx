import type { ReactNode } from "react";
import { useUi } from "@/app/ui/state/UiContext";
import { panelOnDemand } from "@/app/ui/state/uiReducer";
import { cn } from "@/shared/lib/cn";
import { formMsg, formMsgOk, note, panelFoot } from "@/shared/ui/base/styles";

export function PanelHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const { closePanel, ui } = useUi();
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4.5 pt-4 pb-3">
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

export function PanelFoot({ note: text }: { note: ReactNode }) {
  const { ui } = useUi();
  return <div className={panelFoot}>{ui.panelMsg ? <PanelMsg /> : <p className={note}>{text}</p>}</div>;
}
