import type { ReactNode } from "react";
import { useUi } from "./UiContext";

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
