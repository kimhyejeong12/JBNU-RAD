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
import { TopNav } from "./TopNav";

export function TopBar() {
  const me = useMe();
  const auth = useAuth();
  const { select } = useUi();
  const health = useHealth();
  const risks = openRisks(useQueue(), me.role);
  const [popOpen, setPopOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);

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
    <header data-tip-instant className="relative col-span-full flex h-14 items-center gap-6 bg-brand px-6 py-0 text-white narrow:h-auto narrow:min-h-14 narrow:flex-wrap narrow:gap-y-0 narrow:px-4 phone:pb-2">
      {/* 좁은 화면에서 메뉴가 아래 줄로 내려가도 로고 줄이 막대 높이를 지키게 합니다. */}
      <div className="flex flex-none items-center gap-2 narrow:h-13">
        {/* 공용 Icon 의 방패는 선만 그려 남색 위에서 흐려서, 로고만 방패를 채우고 체크를 흰 선으로 그립니다. */}
        <svg className="size-8 flex-none" viewBox="0 0 24 24" aria-hidden="true">
          <path className="fill-brand-red" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path className="fill-none stroke-white stroke-[2.2] [stroke-linecap:round] [stroke-linejoin:round]" d="m9 12 2 2 4-4" />
        </svg>
        <span className="text-[22px] font-bold tracking-wide">Sentinel<span className="font-light text-bar-ink">AI</span></span>
      </div>
      <TopNav />
      {/* 휴대폰 폭에서만 이 묶음을 풀어 프로필 · 종은 로고 줄 오른쪽에, 버튼 둘은 그 아래 줄로 보냅니다. */}
      <div className="ml-auto flex items-center gap-4 phone:contents">
        <span className="flex items-center whitespace-nowrap rounded-[7px] bg-white phone:order-2 px-2.75 py-1.25 text-[12.5px] font-bold text-risk" id="engine-warn" hidden={!problems.length}
          data-tip={`점검 필요|${problems.join(", ")}`}>
          <LevelDot level="위험" />AI 엔진 점검 필요
        </span>
        {/* 누구로 로그인했는지는 다른 곳에 없어 이름을 숨기지 않습니다. */}
        <div className="flex items-center text-sm phone:order-1 phone:ml-auto" id="who">
          <span id="who-name" className="flex flex-col items-end whitespace-nowrap leading-snug">
            <span className="font-medium">{me.display_name} <span className="text-xs text-bar-line-hover">({ROLE_LABEL[me.role]}{me.is_root ? ", 루트" : ""})</span></span>
            {me.department && <span className="text-xs text-bar-line-hover">{me.department}</span>}
          </span>
        </div>
        <span className="mx-1 h-4 w-px flex-none bg-bar-line phone:hidden" aria-hidden="true" />
        <div className="flex items-center gap-3 phone:order-2 phone:w-full phone:justify-end phone:pt-1.5">
          <button className={TOP_BTN} id="btn-password" onClick={() => auth.showPassword(false)}>비밀번호 변경</button>
          <button className={TOP_BTN} id="btn-logout" onClick={() => void logout()}>로그아웃</button>
        </div>
        <button className="relative rounded-[7px] border-none bg-transparent p-1.5 text-white hover:bg-bar-hover phone:order-1" id="bell" hidden={me.role === "user"} aria-label="위험 알림"
          data-tip={risks.length ? `위험 알림 — 미결 ${risks.length}건|눌러서 목록을 봅니다` : "위험 알림|미결 위험이 없습니다"}
          onClick={(e) => { e.stopPropagation(); setPopOpen((o) => !o); }}>
          {/* 글 줄 기준선에 앉으면 아래 글자 자리만큼 떠서 블록으로 둡니다. */}
          <Icon name="bell" className="block" />
          <span id="bell-count" className={cn("absolute top-px right-0 h-4 min-w-4 items-center justify-center rounded-[99px] bg-risk px-1 text-[10.5px] font-bold", risks.length ? "flex" : "hidden")}>{risks.length}</span>
        </button>
      </div>
      <AlertPop ref={pop} open={popOpen} risks={risks} onPick={(key) => { setPopOpen(false); select(key); }} />
    </header>
  );
}

const TOP_BTN = "whitespace-nowrap border-none bg-transparent p-0 text-sm text-bar-line-hover hover:text-white";

function AlertPop({ ref, open, risks, onPick }: { ref: Ref<HTMLDivElement>; open: boolean; risks: QueueItem[]; onPick: (key: string) => void }) {
  return (
    <div id="alert-pop" ref={ref}
      className={cn("absolute top-13 right-4 z-30 w-82.5 rounded-[10px] border border-line bg-surface p-3.5 text-ink shadow-[0_12px_32px_rgba(0,0,0,.14)]", open ? "block" : "hidden")}>
      <h4 className="m-0 mb-2 text-[13px] font-bold">위험 알림 {risks.length ? `— 미결 ${risks.length}건` : "— 미결 없음"}</h4>
      {risks.length
        ? risks.map((it) => (
          <div className="cursor-pointer border-t border-line px-0 py-1.5 text-[12.5px] hover:text-risk" key={it.key} onClick={() => onPick(it.key)}>
            <LevelDot level="위험" />{it.id} <span className="text-ink-dim">{it.who}</span>
          </div>
        ))
        : <p className="m-0 text-[12.5px] text-ink-dim">결정을 기다리는 위험 건이 없습니다.</p>}
    </div>
  );
}
