import { useState } from "react";
import { canWithdraw, mineGroup, mineStatus, rejectNote, shortDate, type MineGroup } from "./lib";
import { useRequestAction } from "./api";
import { useMine } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import type { RequestRow } from "@/shared/api/types";
import { today } from "@/shared/lib/request";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { Pill, Tile } from "@/shared/ui/base/parts";
import { card, empty, formMsg, formMsgOk, linkButton, searchBox, searchInput } from "@/shared/ui/base/styles";
import { ask } from "@/app/ui/confirm/ask";

// 일반 사용자는 패널이 없어 휴대폰 폭에서도 칸을 숨기지 않고 접습니다.
const GRID = "grid grid-cols-[132px_minmax(0,1fr)_150px_120px] items-center gap-x-4 px-4.5 phone:grid-cols-[minmax(0,1fr)_auto] phone:gap-y-0.5";

type MineView = MineGroup | "all";
const TILES: [MineView, string][] = [["all", "전체"], ["pending", "결재 중"], ["active", "사용 중"], ["done", "끝난 것"]];
const EMPTY: Record<MineView, string> = {
  pending: "결재 중인 신청이 없습니다.",
  active: "지금 쓰는 권한이 없습니다.",
  done: "끝난 신청이 없습니다.",
  all: "아직 신청한 권한이 없습니다.",
};

// 상태 배지 — 반려만 빨강, 결재 중은 진하게, 나머지는 흐리게 (색이 많으면 반려가 묻힙니다).
function statusTone(r: RequestRow, group: MineGroup): string {
  if (r.stage === "rejected") return "border-risk text-risk";
  if (group === "pending") return "border-ink text-ink";
  if (group === "active") return "border-line text-ink-soft";
  return "border-line text-ink-dim";
}

// 결재 중이 있으면 그것부터, 없으면 전체를 보여 줍니다 — 처음 들어와 빈 목록을 보지 않게.
export function MineList() {
  const mine = useMine();
  const { ui, toggleChip } = useUi();
  const on = today();
  const counts: Record<MineView, number> = { pending: 0, active: 0, done: 0, all: mine.length };
  for (const r of mine) counts[mineGroup(r, on)] += 1;
  const [picked, setPicked] = useState<MineView | null>(null);
  const [query, setQuery] = useState("");
  const group = picked ?? (counts.pending ? "pending" : "all");
  const q = query.trim().toLowerCase();
  const rows = mine.filter((r) => (group === "all" || mineGroup(r, on) === group)
    && (!q || [r.requested_access, r.access_code, r.request_no, r.reason].join(" ").toLowerCase().includes(q)));
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="grid grid-cols-4 gap-2.5 phone:grid-cols-2" id="mine-tiles" role="group" aria-label="내 신청">
        {TILES.map(([k, label]) => <Tile key={k} label={label} big={counts[k]} pressed={group === k} onClick={() => setPicked(k)} />)}
      </div>
      <section className={cn(card, "flex min-h-80 flex-col")}>
        <div className="flex flex-wrap items-center gap-3 px-4.5 pt-4 pb-3">
          <h3 className="m-0 text-[15.5px] font-bold">내 신청</h3>
          {/* 패널이 없어 철회 결과를 여기에 띄웁니다. */}
          {ui.panelMsg && <span className={ui.panelMsg.startsWith("✓") ? formMsgOk : formMsg}>{ui.panelMsg}</span>}
          <label className={cn(searchBox, "ml-auto max-w-[260px] flex-[1_1_180px]")}>
            <Icon name="search" small />
            <input type="search" className={searchInput} placeholder="권한, 번호, 사유" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="border-t border-line">
          <div className={cn(GRID, "h-9.5 border-b border-line text-[12px] font-semibold text-ink-dim")}>
            <span className="phone:hidden">번호</span><span>신청 권한</span><span className="phone:hidden">신청일, 기간</span><span className="phone:text-right">상태</span>
          </div>
          {rows.length
            ? rows.map((r) => <MineRow key={r.request_no} r={r} on={on} open={ui.expanded.has(`note:${r.request_no}`)} onNote={() => toggleChip(`note:${r.request_no}`)} />)
            : <div className={empty}>{q ? "검색에 맞는 신청이 없습니다." : EMPTY[group]}</div>}
        </div>
      </section>
    </div>
  );
}

function MineRow({ r, on, open, onNote }: { r: RequestRow; on: string; open: boolean; onNote: () => void }) {
  const note = rejectNote(r);
  const group = mineGroup(r, on);
  return (
    <div className={cn(GRID, "border-b border-line py-3 last:border-b-0")}>
      <span className="text-[12px] text-ink-dim tabular-nums phone:col-start-1 phone:row-start-3">{r.request_no}</span>
      <span className="flex min-w-0 flex-col phone:col-start-1 phone:row-start-1">
        <span className="truncate text-[13.5px] font-semibold">{r.requested_access}</span>
        <span className="truncate text-[12px] text-ink-dim" data-tip={r.reason || undefined}>{r.reason || "사유 없음"}</span>
      </span>
      <span className="flex flex-col text-[12.5px] text-ink-soft tabular-nums phone:col-start-1 phone:row-start-2 phone:flex-row phone:gap-2 phone:text-[12px] phone:text-ink-dim">
        <span>{shortDate(r.submitted_at.slice(0, 10), on)} 신청</span>
        <span className="text-[12px] text-ink-dim">{r.period_end ? `${shortDate(r.period_end, on)}까지` : "기한 없음"}</span>
      </span>
      <span className="flex flex-col items-start gap-1 phone:col-start-2 phone:row-span-3 phone:row-start-1 phone:items-end">
        <Pill tone={statusTone(r, group)}>{mineStatus(r, on)}</Pill>
        <span className="flex gap-2.5">
          <WithdrawButton r={r} />
          {note && <button type="button" className={linkButton} aria-expanded={open} onClick={onNote}>{open ? "사유 접기" : "반려 사유"}</button>}
        </span>
      </span>
      {note && open && <p className="col-span-full m-0 mt-2 rounded-lg bg-canvas px-3 py-2 text-[12.5px] whitespace-pre-line text-ink-soft wrap-anywhere">{note}</p>}
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
