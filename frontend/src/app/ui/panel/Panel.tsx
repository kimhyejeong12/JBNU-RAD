import type { ReactNode } from "react";
import { useUi } from "@/app/ui/state/UiContext";

// 패널 제목 줄 — 닫기 버튼은 작은 화면의 서랍(과 질의 탭의 인용 패널)에서만 보입니다. 다른 버튼은 닫기 앞에 둡니다.
export function PanelHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const { closePanel } = useUi();
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      {children}
      <button className="drawer-close" aria-label="닫기" onClick={closePanel}>×</button>
    </div>
  );
}

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
