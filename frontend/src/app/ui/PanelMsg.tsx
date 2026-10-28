import type { ReactNode } from "react";
import { useUi } from "./UiContext";

// 패널 동작 결과 — "✓" 로 시작하면 완료(초록), 아니면 오류. 어느 패널이든 같은 한 줄이라 여기서 읽습니다.
export function PanelMsg() {
  const { ui } = useUi();
  if (!ui.panelMsg) return null;
  return <p className={ui.panelMsg.startsWith("✓") ? "form-msg ok" : "form-msg"}>{ui.panelMsg}</p>;
}

// 패널 아래 칸 — 동작 결과가 있으면 그것을, 없으면 안내 한 줄.
export function PanelFoot({ note }: { note: ReactNode }) {
  const { ui } = useUi();
  return <div className="panel-foot">{ui.panelMsg ? <PanelMsg /> : <p className="note">{note}</p>}</div>;
}
