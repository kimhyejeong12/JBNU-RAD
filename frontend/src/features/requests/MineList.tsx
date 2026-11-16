import { Fragment, useState } from "react";
import { canWithdraw, endedBreakdown, mineGroup, mineStatus, periodText, rejectNote, type MineGroup } from "./lib";
import { useRequestAction } from "./api";
import { useMine } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import type { RequestRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { today } from "@/shared/lib/request";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { Pill, Tile, type TileAccent } from "@/shared/ui/base/parts";
import { card, formMsg, formMsgOk, linkButton } from "@/shared/ui/base/styles";
import { ask } from "@/app/ui/confirm/ask";

const PAGE = 10;
const TH = "p-4 font-medium";
const TD = "p-4 align-middle";
const PAGER = "flex size-8 items-center justify-center rounded border border-line bg-surface text-sm font-medium text-ink-soft hover:bg-row-hover disabled:cursor-default disabled:opacity-50 aria-[current=true]:border-brand aria-[current=true]:bg-brand aria-[current=true]:text-white";

type MineView = MineGroup | "all";
const TILES: [MineView, string][] = [["all", "전체 신청"], ["pending", "결재 대기"], ["active", "사용 중"], ["done", "반려, 만료"]];

// 상태마다 색 하나 — 타일의 점 · 고른 테두리와 표의 배지가 같은 색이라 표를 보고 어느 타일인지 이어집니다.
// 결재 대기는 테마 남색 (주황은 운영자 화면에서 "주의"라 겹치지 않게).
const COLOR: Record<MineView, { dot: string; accent: TileAccent; pill: string }> = {
  all: { dot: "var(--color-ink-ghost)", accent: { line: "var(--color-ink-dim)", tint: "var(--color-canvas)" }, pill: "border-transparent bg-canvas text-ink-dim" },
  pending: { dot: "var(--color-brand)", accent: { line: "var(--color-brand)", tint: "var(--color-brand-soft)" }, pill: "border-transparent bg-brand-soft text-brand" },
  active: { dot: "var(--color-ok)", accent: { line: "var(--color-ok)", tint: "var(--color-ok-tint)" }, pill: "border-transparent bg-ok-tint text-ok" },
  done: { dot: "var(--color-risk)", accent: { line: "var(--color-risk)", tint: "var(--color-risk-tint)" }, pill: "border-transparent bg-risk-tint text-risk" },
};
const EMPTY: Record<MineView, string> = {
  pending: "결재 중인 신청이 없습니다.",
  active: "지금 쓰는 권한이 없습니다.",
  done: "반려되거나 만료된 신청이 없습니다.",
  all: "아직 신청한 권한이 없습니다.",
};

// 상태 배지 — 묶음의 색, 스스로 철회한 것만 회색입니다 (확인할 일이 아니라서).
const statusTone = (r: RequestRow, group: MineGroup): string => (r.stage === "withdrawn" ? COLOR.all.pill : COLOR[group].pill);

// 결재 대기가 있으면 그것부터, 없으면 전체를 보여 줍니다 — 처음 들어와 빈 목록을 보지 않게.
export function MineList() {
  const mine = useMine();
  const { ui, toggleChip } = useUi();
  const on = today();
  const counts: Record<MineView, number> = { pending: 0, active: 0, done: 0, all: mine.length };
  for (const r of mine) counts[mineGroup(r, on)] += 1;
  const [picked, setPicked] = useState<MineView | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const group = picked ?? (counts.pending ? "pending" : "all");
  const q = query.trim().toLowerCase();
  const rows = mine.filter((r) => (group === "all" || mineGroup(r, on) === group)
    && (!q || [r.requested_access, r.access_code, r.request_no, r.reason].join(" ").toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const at = Math.min(page, pages);
  const shown = rows.slice((at - 1) * PAGE, at * PAGE);
  return (
    <div className="flex h-full min-w-0 flex-col gap-6">
      <div className="grid grid-cols-4 gap-4 phone:grid-cols-2" id="mine-tiles" role="group" aria-label="내 신청">
        {TILES.map(([k, label]) => (
          // 내역은 숫자 옆에 작게 — 아래 줄에 두면 이 타일만 높아져 네 타일 높이가 어긋납니다.
          <Tile key={k} label={label} pressed={group === k} dot={COLOR[k].dot} accent={COLOR[k].accent} onClick={() => { setPicked(k); setPage(1); }}
            big={<>{counts[k]}{k === "done" && counts.done > 0 && <span className="ml-1.5 text-xs font-normal text-ink-dim">{endedBreakdown(mine, on)}</span>}</>} />
        ))}
      </div>
      <section className={cn(card, "flex flex-1 flex-col overflow-hidden")}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-canvas/50 p-5">
          <h2 className="m-0 text-lg font-bold">나의 권한 신청 내역</h2>
          {/* 패널이 없어 철회 결과를 여기에 띄웁니다. */}
          {ui.panelMsg && <span className={ui.panelMsg.startsWith("✓") ? formMsgOk : formMsg}>{ui.panelMsg}</span>}
          <label className="relative ml-auto w-64 phone:w-full">
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"><Icon name="search" small /></span>
            <input type="search" className="w-full rounded-md border border-line bg-surface py-1.5 pr-4 pl-9 text-sm outline-none focus:border-brand"
              placeholder="권한, 번호 검색" autoComplete="off" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          </label>
        </div>
        <div className="flex-1 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-canvas text-sm text-ink-dim">
                <th className={cn(TH, "w-48")}>요청번호</th><th className={TH}>신청 권한</th><th className={cn(TH, "w-56")}>신청일, 기간</th><th className={cn(TH, "w-48 text-center")}>상태</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {shown.length
                ? shown.map((r) => <MineRow key={r.request_no} r={r} on={on} open={ui.expanded.has(`note:${r.request_no}`)} onNote={() => toggleChip(`note:${r.request_no}`)} />)
                : <tr><td colSpan={4} className="px-4 py-12 text-center text-ink-dim">{q ? "검색에 맞는 신청이 없습니다." : EMPTY[group]}</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav className="flex items-center justify-center gap-2 border-t border-line p-4" aria-label="쪽">
            <button type="button" className={PAGER} disabled={at === 1} onClick={() => setPage(at - 1)} aria-label="앞 쪽"><Icon name="back" small /></button>
            {Array.from({ length: pages }, (_, n) => n + 1).map((n) => (
              <button type="button" key={n} className={PAGER} aria-current={n === at} onClick={() => setPage(n)}>{n}</button>
            ))}
            <button type="button" className={PAGER} disabled={at === pages} onClick={() => setPage(at + 1)} aria-label="다음 쪽"><Icon name="chev" small /></button>
          </nav>
        )}
      </section>
    </div>
  );
}

function MineRow({ r, on, open, onNote }: { r: RequestRow; on: string; open: boolean; onNote: () => void }) {
  const note = rejectNote(r);
  const group = mineGroup(r, on);
  return (
    <Fragment>
      <tr className={cn("border-b border-line hover:bg-row-hover", open && "border-b-0")}>
        <td className={cn(TD, "text-xs text-ink-dim tabular-nums")}>{r.request_no}</td>
        <td className={TD}>
          {/* 사유는 마우스를 올리면 — 아래 줄에 두면 줄마다 높아집니다. */}
          <span className={cn("block font-medium", group === "done" && "text-ink-soft")} data-tip={r.reason ? `신청 사유|${r.reason}` : undefined}>
            {r.requested_access}{r.access_code ? ` (${r.access_code})` : ""}
          </span>
        </td>
        <td className={cn(TD, "text-ink-dim tabular-nums")}>
          <span className="block">{stamp(r.submitted_at)}</span>
          <span className="mt-0.5 block text-xs">기간: {periodText(r)}</span>
        </td>
        <td className={cn(TD, "text-center")}>
          <span className="inline-flex items-center gap-2.5">
            <Pill tone={statusTone(r, group)} className="px-3 py-1.5 text-xs">{mineStatus(r, on)}</Pill>
            <WithdrawButton r={r} />
            {note && <button type="button" className={cn(linkButton, "self-center")} aria-expanded={open} onClick={onNote}>{open ? "접기" : "사유"}</button>}
          </span>
        </td>
      </tr>
      {note && open && (
        <tr className="border-b border-line">
          <td colSpan={4} className="px-4 pt-0 pb-4">
            <p className="m-0 rounded-lg bg-canvas px-3 py-2 text-[12.5px] whitespace-pre-line text-ink-soft wrap-anywhere">{note}</p>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function WithdrawButton({ r }: { r: RequestRow }) {
  const action = useRequestAction();
  if (!canWithdraw(r)) return null;
  const withdraw = async () => {
    if (await ask({ title: "신청 철회", confirm: "철회", danger: true, message: `${r.request_no} 신청을 철회합니다.` })) action.mutate({ no: r.request_no, act: "withdraw" });
  };
  return <button type="button" className={cn(linkButton, "self-center")} disabled={action.isPending} onClick={withdraw}>철회</button>;
}
