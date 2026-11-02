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

const GROUPS: [MineGroup, string][] = [["pending", "결재 중"], ["active", "사용 중"], ["done", "끝난 것"]];
const EMPTY: Record<MineGroup, string> = {
  pending: "결재 중인 신청이 없습니다.",
  active: "지금 쓰는 권한이 없습니다.",
  done: "끝난 신청이 없습니다.",
};

// 내 신청 현황 (일반 사용자) — 결재 중 · 사용 중 · 끝난 것으로 나눠 처음에는 결재 중만 보여줍니다 (지난 기록이 섞이면 지금 볼 것이 묻혀서).
// 줄은 두 줄로 간단히 — 위에 권한 이름 · 상태, 아래에 신청 번호 · 날짜와 [철회] · [사유 보기]. 사유는 본인이 쓴 글이라 뺐습니다.
export function MineList() {
  const mine = useMine();
  const { ui, toggleChip } = useUi();
  const [group, setGroup] = useState<MineGroup>("pending");
  const on = today();
  const counts: Record<MineGroup, number> = { pending: 0, active: 0, done: 0 };
  for (const r of mine) counts[mineGroup(r, on)] += 1;
  const rows = mine.filter((r) => mineGroup(r, on) === group);
  return (
    <section className={cn(card, "flex min-h-80 flex-col")}>
      <div className="flex flex-wrap items-center gap-3 px-4.5 pt-4 pb-3">
        <h3 className="m-0 text-[15.5px] font-bold">내 신청 현황</h3>
        {/* 패널이 없어 철회 결과를 여기에 띄웁니다. */}
        {ui.panelMsg && <span className={ui.panelMsg.startsWith("✓") ? formMsgOk : formMsg}>{ui.panelMsg}</span>}
        <div className="ml-auto">
          <Periods<MineGroup> id="mine-group" label="내 신청" value={group} onChange={setGroup}
            labels={GROUPS.map(([k, name]) => [k, <>{name}<span className="ml-1.5 tabular-nums text-ink-faint">{counts[k]}</span></>])} />
        </div>
      </div>
      <div className="border-t border-line">
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
    <div className="flex flex-col gap-0.5 border-b border-line px-4.5 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{r.requested_access}</span>
        <span className="shrink-0 text-[12.5px] font-semibold">{mineStatus(r, on)}</span>
      </div>
      <div className="flex items-center gap-3 text-[11.5px] text-ink-dim">
        <span className="tabular-nums">{r.request_no} · {shortDate(r.submitted_at.slice(0, 10), on)}</span>
        <span className="ml-auto flex gap-3">
          <WithdrawButton r={r} />
          {note && <button type="button" className={linkButton} aria-expanded={open} onClick={onNote}>{open ? "사유 접기" : "사유 보기"}</button>}
        </span>
      </div>
      {note && open && <p className="m-0 mt-1 rounded-lg bg-canvas px-3 py-2 text-[12.5px] whitespace-pre-line text-ink-soft wrap-anywhere">{note}</p>}
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
