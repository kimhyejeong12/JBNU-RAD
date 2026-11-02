import { useState } from "react";
import { canWithdraw, mineGroup, mineStatus, rejectNote, shortDate, type MineGroup } from "./lib";
import { useRequestAction } from "./api";
import { useMine } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import type { RequestRow } from "@/shared/api/types";
import { today } from "@/shared/lib/request";
import { cn } from "@/shared/lib/cn";
import { Periods } from "@/shared/ui/base/parts";
import { card, empty, formMsg, formMsgOk, linkButton } from "@/shared/ui/base/styles";

// 머리줄과 줄이 같은 칸 — 신청 권한 · 번호 · 신청일 · 상태 · [철회 · 사유 보기].
// 휴대폰 폭(760px 이하, styles.css 의 phone)은 칸을 숨기지 않고 두 줄로 접습니다 — 윗줄 권한 · 상태, 아랫줄 번호 · 신청일 · 버튼 (일반 사용자는 패널이 없어 숨기면 볼 곳이 없음).
const GRID = "grid grid-cols-[minmax(0,1fr)_150px_64px_150px_96px] items-center gap-x-4 px-4.5 phone:grid-cols-[minmax(0,1fr)_auto] phone:gap-y-0.5";

// 보기 — 세 묶음과 전체 (결재함 탭 [결재 대기 · 유효 권한 · 전체]와 같은 순서).
type MineView = MineGroup | "all";
const GROUPS: [MineView, string][] = [["pending", "결재 중"], ["active", "사용 중"], ["done", "끝난 것"], ["all", "전체"]];
const EMPTY: Record<MineView, string> = {
  pending: "결재 중인 신청이 없습니다.",
  active: "지금 쓰는 권한이 없습니다.",
  done: "끝난 신청이 없습니다.",
  all: "아직 신청한 권한이 없습니다.",
};

// 내 신청 현황 (일반 사용자) — 결재 중 · 사용 중 · 끝난 것으로 나눠 처음에는 결재 중만 보여줍니다 (지난 기록이 섞이면 지금 볼 것이 묻혀서).
// 머리줄 아래 줄마다 한 줄 — 신청 권한 · 번호 · 신청일 · 상태 · [철회] · [사유 보기]. 사유는 본인이 쓴 글이라 뺐습니다.
export function MineList() {
  const mine = useMine();
  const { ui, toggleChip } = useUi();
  const [group, setGroup] = useState<MineView>("pending");
  const on = today();
  const counts: Record<MineView, number> = { pending: 0, active: 0, done: 0, all: mine.length };
  for (const r of mine) counts[mineGroup(r, on)] += 1;
  const rows = group === "all" ? mine : mine.filter((r) => mineGroup(r, on) === group);
  return (
    <section className={cn(card, "flex min-h-80 flex-col")}>
      <div className="flex flex-wrap items-center gap-3 px-4.5 pt-4 pb-3">
        <h3 className="m-0 text-[15.5px] font-bold">내 신청 현황</h3>
        {/* 패널이 없어 철회 결과를 여기에 띄웁니다. */}
        {ui.panelMsg && <span className={ui.panelMsg.startsWith("✓") ? formMsgOk : formMsg}>{ui.panelMsg}</span>}
        <div className="ml-auto">
          <Periods<MineView> id="mine-group" label="내 신청" value={group} onChange={setGroup}
            labels={GROUPS.map(([k, name]) => [k, <>{name}<span className="ml-1.5 tabular-nums text-ink-faint">{counts[k]}</span></>])} />
        </div>
      </div>
      <div className="border-t border-line">
        <div className={cn(GRID, "h-9.5 border-b border-line text-[12px] font-semibold text-ink-dim")}>
          <span>신청 권한</span><span className="phone:hidden">번호</span><span className="phone:hidden">신청일</span><span>상태</span><span className="phone:hidden" />
        </div>
        {rows.length
          ? rows.map((r) => <MineRow key={r.request_no} r={r} on={on} open={ui.expanded.has(`note:${r.request_no}`)} onNote={() => toggleChip(`note:${r.request_no}`)} />)
          : <div className={empty}>{EMPTY[group]}</div>}
      </div>
    </section>
  );
}

// 신청 한 줄 — 반려 사유는 반려 직후 한 번 보면 되는 정보라 접어 두고 [사유 보기]로 엽니다.
function MineRow({ r, on, open, onNote }: { r: RequestRow; on: string; open: boolean; onNote: () => void }) {
  const note = rejectNote(r);
  return (
    <div className={cn(GRID, "border-b border-line py-2.5 last:border-b-0")}>
      <span className="truncate text-[13.5px] font-semibold phone:row-start-1">{r.requested_access}</span>
      <span className="text-[12px] text-ink-dim tabular-nums phone:col-start-1 phone:row-start-2">{r.request_no}<span className="min-[761px]:hidden"> · {shortDate(r.submitted_at.slice(0, 10), on)}</span></span>
      <span className="text-[12px] text-ink-dim tabular-nums phone:hidden">{shortDate(r.submitted_at.slice(0, 10), on)}</span>
      <span className="text-[12.5px] font-semibold phone:col-start-2 phone:row-start-1 phone:text-right">{mineStatus(r, on)}</span>
      <span className="flex justify-end gap-3 phone:col-start-2 phone:row-start-2">
        <WithdrawButton r={r} />
        {note && <button type="button" className={linkButton} aria-expanded={open} onClick={onNote}>{open ? "사유 접기" : "사유 보기"}</button>}
      </span>
      {note && open && <p className="col-span-full m-0 mt-1.5 phone:row-start-3 rounded-lg bg-canvas px-3 py-2 text-[12.5px] whitespace-pre-line text-ink-soft wrap-anywhere">{note}</p>}
    </div>
  );
}

// [철회] — 1차 결재 전에만 보입니다. 결과 문구는 목록 제목 줄에 뜹니다.
function WithdrawButton({ r }: { r: RequestRow }) {
  const action = useRequestAction();
  if (!canWithdraw(r)) return null;
  const withdraw = () => {
    if (confirm(`${r.request_no} 신청을 철회합니다.`)) action.mutate({ no: r.request_no, act: "withdraw" });
  };
  return <button type="button" className={linkButton} disabled={action.isPending} onClick={withdraw}>철회</button>;
}
