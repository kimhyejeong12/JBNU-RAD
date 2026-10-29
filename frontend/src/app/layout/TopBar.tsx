import { useEffect, useRef, useState, type Ref } from "react";
import { useMe } from "@/app/session/me";
import { useHealth } from "@/app/session/data";
import { engineProblems } from "./warnings";
import { useUi } from "@/app/ui/state/UiContext";
import { useQueue } from "@/app/queue/useQueue";
import { openRisks } from "@/app/queue/select";
import { useAuth } from "@/features/auth/AuthContext";
import { logout } from "@/features/auth/api";
import { ROLE_LABEL } from "@/shared/lib/labels";
import { Icon } from "@/shared/ui/base/Icon";
import { LevelDot } from "@/shared/ui/base/parts";
import type { QueueItem } from "@/app/queue/types";

export function TopBar() {
  const me = useMe();
  const auth = useAuth();
  const { select } = useUi();
  const health = useHealth();
  const risks = openRisks(useQueue(), me.role);
  const [popOpen, setPopOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);

  // 정상일 때는 아무것도 띄우지 않고, 문제가 있을 때만 경고 1개를 띄웁니다. 일반 사용자에게는 AI 가 보이지 않으므로 엔진 경고도 없습니다.
  const problems = me.role === "user" || health.isPending || health.data?.ok ? [] : engineProblems(health.data);

  useEffect(() => {
    if (!popOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!pop.current?.contains(e.target as Node)) setPopOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [popOpen]);

  return (
    <header className="topbar">
      <div className="logo"><Icon name="shield" />SentinelAI</div>
      <div className="top-right">
        <span className="engine-warn" id="engine-warn" hidden={!problems.length}
          data-tip={`점검 항목|${problems.join(" · ")}. 저장된 판정 결과는 계속 볼 수 있습니다`}>
          <LevelDot level="위험" />AI 엔진 점검 필요
        </span>
        <div className="whoami" id="who">
          <span id="who-name">{me.display_name} · {ROLE_LABEL[me.role]}{me.is_root ? " (루트)" : ""}</span>
          <button className="top-btn" id="btn-password" onClick={() => auth.showPassword(false)}>비밀번호 변경</button>
          <button className="top-btn" id="btn-logout" onClick={() => void logout()}>로그아웃</button>
        </div>
        <button className="bell" id="bell" hidden={me.role === "user"} aria-label="위험 알림"
          data-tip={risks.length ? `위험 알림 — 미결 ${risks.length}건|눌러서 목록을 봅니다` : "위험 알림|미결 위험이 없습니다"}
          onClick={(e) => { e.stopPropagation(); setPopOpen((o) => !o); }}>
          <Icon name="bell" /><span className={risks.length ? "count show" : "count"} id="bell-count">{risks.length}</span>
        </button>
      </div>
      <AlertPop ref={pop} open={popOpen} risks={risks} onPick={(key) => { setPopOpen(false); select(key); }} />
    </header>
  );
}

// 종을 누르면 뜨는 위험 알림 목록 — 미결 위험 건을 누르면 그 항목으로 갑니다.
function AlertPop({ ref, open, risks, onPick }: { ref: Ref<HTMLDivElement>; open: boolean; risks: QueueItem[]; onPick: (key: string) => void }) {
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
