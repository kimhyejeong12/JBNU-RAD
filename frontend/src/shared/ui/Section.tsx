import type { ReactNode } from "react";
import { Icon } from "./Icon";

// 패널 안의 작은 구역 — 아이콘 + 제목 + 내용.
export function Section({ icon, title, children }: { icon: string; title: ReactNode; children: ReactNode }) {
  return (
    <div className="sec">
      <h4><Icon name={icon} className="sm" />{title}</h4>
      {children}
    </div>
  );
}
