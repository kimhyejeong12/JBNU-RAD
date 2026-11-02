import type { ReactNode } from "react";
import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { LEVEL_VIEWS, VIEWS } from "@/app/session/views";
import { useUi } from "@/app/ui/state/UiContext";
import type { LevelFilter } from "@/app/ui/state/uiReducer";
import { runButton, useStartJob } from "@/shared/api/jobs";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { searchBox, searchInput, toolButton } from "@/shared/ui/base/styles";
import { LevelDot, Periods } from "@/shared/ui/base/parts";
import { LEVEL_TIP } from "@/shared/lib/labels";
import type { Level } from "@/shared/api/types";
import { useQueue } from "./useQueue";
import { levelCounts } from "./select";

// 대기열 머리 — 첫 줄은 제목 · 검색 · 실행 버튼, 둘째 줄은 등급 거르기 버튼(권한 신청의 결재 단계는 위 탭 줄에). 버튼은 빼지 않고 hidden 으로 숨깁니다.
// 검색 칸이 오른쪽으로 밀고 버튼은 그 옆에 붙입니다 (버튼도 밀면 남는 자리를 나눠 검색 칸이 가운데로 뜹니다).
// 등급 거르기는 예전 요약 카드(큰 숫자 카드 3장)를 대신합니다 — 카드는 누르면 거른다는 게 안 읽혀서, 누르는 버튼 모양에 건수를 붙였습니다.
const Count = ({ n }: { n: number }) => <span className="ml-1.5 tabular-nums text-ink-faint">{n}</span>;

export function QueueHead() {
  const me = useMe();
  const { ui, setQuery, setFilter, deselect } = useUi();
  const jobs = useJobs();
  const items = useQueue();
  const start = useStartJob();
  const meta = ui.view ? VIEWS[ui.view] : null;
  const title = ui.view === "requests"
    ? `${meta?.label} — ${me.role === "manager" ? "1차" : "최종"} 결재함`
    : meta?.title ?? "현황";
  // 분석 실행은 정책 관리만 합니다. 수 분 걸리므로 진행 상황을 버튼에 띄웁니다.
  const run = runButton(jobs, ui.view, start.isPending);
  const view = ui.view;
  // 로그 감시는 주의 이상만 검토에 올라오므로 정상 버튼을 두지 않습니다.
  const levels: Level[] = view === "events" ? ["주의", "위험"] : ["정상", "주의", "위험"];
  const byLevel = view && LEVEL_VIEWS.has(view) ? levelCounts(items, view, ui.stageFilter, me.role) : null;
  return (
    <div className="flex flex-col gap-2.5 px-4.5 pt-4 pb-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="queue-title" className="m-0 text-[15.5px] font-bold">{title}</h3>
        <label className={cn(searchBox, "ml-auto max-w-[320px] flex-[1_1_220px]")}>
          <Icon name="search" small />
          <input id="q" type="search" className={searchInput} placeholder={meta?.search ?? ""} autoComplete="off" value={ui.query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className={cn(toolButton, "ml-0")} id="run" hidden={run.hidden} disabled={run.disabled} onClick={() => start.mutate("policies")}>
          <Icon name="activity" small /><span id="run-txt">{run.text}</span>
        </button>
        <button className={cn(toolButton, "ml-0")} id="add-user" hidden={ui.view !== "users"} onClick={deselect}><Icon name="plus" small />새 계정</button>
        <button className={cn(toolButton, "ml-0")} id="add-access" hidden={ui.view !== "access"} onClick={deselect}><Icon name="plus" small />권한 등록</button>
        <button className={cn(toolButton, "ml-0")} id="add-doc" hidden={ui.view !== "docs" || me.role !== "top"} onClick={deselect}><Icon name="plus" small />문서 업로드</button>
      </div>
      {byLevel && (
        <div className="flex flex-wrap items-center gap-2">
          {/* 등급 거르기 — 권고 문구(승인 · 추가 검토 · 반려 권고)는 등급 이름의 툴팁에 둡니다. */}
          <Periods<LevelFilter> id="level-filter" label="AI 판정 등급" value={ui.filter} onChange={setFilter}
            labels={[["전체", <>전체<Count n={byLevel["전체"]} /></>], ...levels.map((l): [LevelFilter, ReactNode] => [l, <span key={l} data-tip={LEVEL_TIP[l]}><LevelDot level={l} />{l}<Count n={byLevel[l]} /></span>])]} />
        </div>
      )}
    </div>
  );
}
