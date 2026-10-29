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
import { cn } from "@/shared/lib/cn";

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
    // 툴팁이 곧바로 뜨는 구역입니다 (data-tip-instant).
    <header data-tip-instant className="col-span-full flex items-center gap-4.5 bg-ink px-5 py-0 text-white narrow:flex-wrap narrow:gap-y-2 narrow:px-4 narrow:py-2.5">
      <div className="flex items-center gap-2.25 text-[17px] font-extrabold tracking-[-0.3px]"><Icon name="shield" className="size-6 stroke-risk stroke-[2.2]" />SentinelAI</div>
      <div className="ml-auto flex items-center gap-2">
        <span className="flex items-center whitespace-nowrap rounded-[7px] bg-white px-2.75 py-1.25 text-[12.5px] font-bold text-risk" id="engine-warn" hidden={!problems.length}
          data-tip={`점검 항목|${problems.join(" · ")}. 저장된 판정 결과는 계속 볼 수 있습니다`}>
          <LevelDot level="위험" />AI 엔진 점검 필요
        </span>
        <div className="flex items-center gap-1.5 text-[12.5px] text-bar-ink" id="who">
          <span id="who-name" className="narrow:hidden">{me.display_name} · {ROLE_LABEL[me.role]}{me.is_root ? " (루트)" : ""}</span>
          <button className={TOP_BTN} id="btn-password" onClick={() => auth.showPassword(false)}>비밀번호 변경</button>
          <button className={TOP_BTN} id="btn-logout" onClick={() => void logout()}>로그아웃</button>
        </div>
        <button className="relative ml-1.5 rounded-[7px] border-none bg-transparent p-1.5 text-white hover:bg-bar-hover" id="bell" hidden={me.role === "user"} aria-label="위험 알림"
          data-tip={risks.length ? `위험 알림 — 미결 ${risks.length}건|눌러서 목록을 봅니다` : "위험 알림|미결 위험이 없습니다"}
          onClick={(e) => { e.stopPropagation(); setPopOpen((o) => !o); }}>
          <Icon name="bell" />
          <span id="bell-count" className={cn("absolute top-px right-0 h-4 min-w-4 items-center justify-center rounded-[99px] bg-risk px-1 text-[10.5px] font-bold", risks.length ? "flex" : "hidden")}>{risks.length}</span>
        </button>
      </div>
      <AlertPop ref={pop} open={popOpen} risks={risks} onPick={(key) => { setPopOpen(false); select(key); }} />
    </header>
  );
}

// 검은 바 위의 작은 버튼 — 흰 글자, hover 때 테두리가 밝아집니다.
const TOP_BTN = "rounded-[7px] border border-bar-line bg-transparent px-2.5 py-1 text-[12px] text-bar-ink hover:border-bar-line-hover hover:text-white";

// 종을 누르면 뜨는 위험 알림 목록 — 미결 위험 건을 누르면 그 항목으로 갑니다.
function AlertPop({ ref, open, risks, onPick }: { ref: Ref<HTMLDivElement>; open: boolean; risks: QueueItem[]; onPick: (key: string) => void }) {
  return (
    <div id="alert-pop" ref={ref}
      className={cn("absolute top-12.5 right-4 z-30 w-82.5 rounded-[10px] border border-line bg-surface p-3.5 text-ink shadow-[0_12px_32px_rgba(0,0,0,.14)]", open ? "block" : "hidden")}>
      <h4 className="m-0 mb-2 text-[13px] font-bold">위험 알림 {risks.length ? `— 미결 ${risks.length}건` : "— 미결 없음"}</h4>
      {risks.length
        ? risks.map((it) => (
          <div className="cursor-pointer border-t border-line px-0 py-1.5 text-[12.5px] hover:text-risk" key={it.key} onClick={() => onPick(it.key)}>
            <LevelDot level="위험" />{it.id} · {it.who}
          </div>
        ))
        : <p className="m-0 text-[12.5px] text-ink-dim">결정을 기다리는 위험 건이 없습니다.</p>}
    </div>
  );
}
