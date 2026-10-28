import type { Ref } from "react";
import type { QueueItem } from "./queue/types";
import { LevelDot } from "@/shared/ui/LevelDot";

// 종을 누르면 뜨는 위험 알림 목록 — 미결 위험 건을 누르면 그 항목으로 갑니다.
export function AlertPop({ ref, open, risks, onPick }: { ref: Ref<HTMLDivElement>; open: boolean; risks: QueueItem[]; onPick: (key: string) => void }) {
  return (
    <div className={open ? "alert-pop show" : "alert-pop"} id="alert-pop" ref={ref}>
      <h4>위험 알림 {risks.length ? `— 미결 ${risks.length}건` : "— 미결 없음"}</h4>
      {risks.length
        ? risks.map((it) => (
          <div className="risk-item" key={it.key} onClick={() => onPick(it.key)}>
            <LevelDot level="위험" />{it.id} · {it.who}
          </div>
        ))
        : <p className="none">결정을 기다리는 위험 건이 없습니다.</p>}
    </div>
  );
}
