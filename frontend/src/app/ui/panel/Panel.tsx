import type { ReactNode } from "react";
import { useUi } from "@/app/ui/state/UiContext";
import { panelOnDemand } from "@/app/ui/state/uiReducer";
import { cn } from "@/shared/lib/cn";
import { formMsg, formMsgOk, note, panelFoot } from "@/shared/ui/base/styles";

// 패널 제목 줄 — 닫기 버튼은 작은 화면의 서랍과 질의 탭의 인용 패널에서만 보입니다.
// 다른 버튼(children)은 닫기 앞에 두고, 그때 닫기는 그 버튼 바로 옆에 붙습니다.
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

// 패널 동작 결과 — "✓" 로 시작하면 완료(초록), 아니면 오류. 어느 패널이든 같은 한 줄이라 여기서 읽습니다.
export function PanelMsg() {
  const { ui } = useUi();
  if (!ui.panelMsg) return null;
  return <p className={cn(ui.panelMsg.startsWith("✓") ? formMsgOk : formMsg, "my-[1em]")}>{ui.panelMsg}</p>;
}

// 패널 아래 칸 — 동작 결과가 있으면 그것을, 없으면 안내 한 줄.
export function PanelFoot({ note: text }: { note: ReactNode }) {
  const { ui } = useUi();
  return <div className={panelFoot}>{ui.panelMsg ? <PanelMsg /> : <p className={note}>{text}</p>}</div>;
}
