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
import { ask } from "@/app/ui/confirm/ask";

// 일반 사용자는 패널이 없어 휴대폰 폭에서도 칸을 숨기지 않고 접습니다.
const GRID = "grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1.3fr)_150px_150px_96px] items-center gap-x-4 px-4.5 phone:grid-cols-[minmax(0,1fr)_auto] phone:gap-y-0.5";

type MineView = MineGroup | "all";
const GROUPS: [MineView, string][] = [["pending", "결재 중"], ["active", "사용 중"], ["done", "끝난 것"], ["all", "전체"]];
const EMPTY: Record<MineView, string> = {
  pending: "결재 중인 신청이 없습니다.",
  active: "지금 쓰는 권한이 없습니다.",
  done: "끝난 신청이 없습니다.",
  all: "아직 신청한 권한이 없습니다.",
};

// 지난 기록이 섞이면 지금 볼 것이 묻혀서 처음에는 결재 중만 보여줍니다.
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
          <span className="phone:hidden">신청일</span><span>신청 권한</span><span className="phone:hidden">사유</span><span>상태</span><span className="phone:hidden">번호</span><span className="phone:hidden" />
        </div>
        {rows.length
          ? rows.map((r) => <MineRow key={r.request_no} r={r} on={on} open={ui.expanded.has(`note:${r.request_no}`)} onNote={() => toggleChip(`note:${r.request_no}`)} />)
          : <div className={empty}>{EMPTY[group]}</div>}
      </div>
    </section>
  );
}

function MineRow({ r, on, open, onNote }: { r: RequestRow; on: string; open: boolean; onNote: () => void }) {
  const note = rejectNote(r);
  return (
    <div className={cn(GRID, "border-b border-line py-2.5 last:border-b-0")}>
      <span className="text-[12.5px] text-ink-soft tabular-nums phone:hidden">{shortDate(r.submitted_at.slice(0, 10), on)}</span>
      <span className="truncate text-[13.5px] font-semibold phone:col-start-1 phone:row-start-1">{r.requested_access}</span>
      <span className="truncate text-[12.5px] text-ink-soft phone:col-span-full phone:row-start-3 phone:text-[12px] phone:text-ink-dim">{r.reason || "—"}</span>
      <span className="text-[12.5px] font-semibold phone:col-start-2 phone:row-start-1 phone:text-right">{mineStatus(r, on)}</span>
      <span className="text-[12px] text-ink-dim tabular-nums phone:col-start-1 phone:row-start-2">{r.request_no}<span className="ml-2 min-[761px]:hidden">{shortDate(r.submitted_at.slice(0, 10), on)}</span></span>
      <span className="flex justify-end gap-3 phone:col-start-2 phone:row-start-2">
        <WithdrawButton r={r} />
        {note && <button type="button" className={linkButton} aria-expanded={open} onClick={onNote}>{open ? "사유 접기" : "사유 보기"}</button>}
      </span>
      {note && open && <p className="col-span-full m-0 mt-1.5 phone:row-start-4 rounded-lg bg-canvas px-3 py-2 text-[12.5px] whitespace-pre-line text-ink-soft wrap-anywhere">{note}</p>}
    </div>
  );
}

function WithdrawButton({ r }: { r: RequestRow }) {
  const action = useRequestAction();
  if (!canWithdraw(r)) return null;
  const withdraw = async () => {
    if (await ask({ title: "신청 철회", confirm: "철회", danger: true, message: `${r.request_no} 신청을 철회합니다.` })) action.mutate({ no: r.request_no, act: "withdraw" });
  };
  return <button type="button" className={linkButton} disabled={action.isPending} onClick={withdraw}>철회</button>;
}
