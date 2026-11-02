import { useState, type FormEvent } from "react";
import { accessOptions, canWithdraw, matchAccess, type AccessOptions } from "./lib";
import { useCreateRequest, useRequestAction } from "./api";
import { useCatalog, useMine } from "@/app/session/data";
import type { AccessItem, RequestRow } from "@/shared/api/types";
import { isActive } from "@/shared/lib/request";
import { cn } from "@/shared/lib/cn";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { Icon } from "@/shared/ui/base/Icon";
import { actionButton, card, field, formActions, formGrid, formMsg, formMsgOk, input, note, primaryButton, searchBox, searchInput } from "@/shared/ui/base/styles";

// 일반 사용자의 권한 신청서 — 권한은 권한 목록의 켜진 권한을 카드로 펼쳐 놓고 하나를 고르고, 현재 보유 권한은 적지 않고 보여주기만 합니다.
// (서버도 신청 때 같은 조건으로 읽어 신청 행에 남깁니다.)
export function RequestForm({ hidden }: { hidden: boolean }) {
  const catalog = useCatalog();
  const mine = useMine();
  const create = useCreateRequest();
  const [code, setCode] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: false });

  const o = accessOptions(catalog, mine, code);
  const held = mine.filter((r) => isActive(r));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    create.mutate(Object.fromEntries(new FormData(form)), {
      onSuccess: (made) => {
        form.reset();
        setCode("");
        setQ("");
        setMsg({ text: `${made.request_no} 신청했습니다. 보안 운영자의 1차 결재를 기다립니다.`, ok: true });
      },
      onError: (err) => setMsg({ text: err.message, ok: false }),
    });
  }

  return (
    <section className={card} id="req-form" hidden={hidden}>
      <h3 className="m-0 px-4.5 pt-4 pb-2 text-[15.5px] font-bold">권한 신청</h3>
      <form id="new-request" className={formGrid} onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <div className={cn(field, "col-span-full")}>
          <span>신청할 권한 <b className="text-risk">*</b></span>
          <AccessPicker o={o} q={q} onQuery={setQ} onPick={setCode} />
        </div>
        <div className="col-span-full grid gap-1.5">
          <span className="text-[12.5px] font-semibold text-ink-dim">현재 보유 권한</span>
          <div id="req-held">
            {held.length
              ? <ul className="mx-0 mt-1 mb-0 list-disc pl-4.5 text-[13px]">{held.map((r) => <li key={r.request_no}>{r.requested_access}{" "}<span className={cn(note, "mt-1")}>{r.period_end ? `${r.period_end}까지` : "기간 없음"}</span></li>)}</ul>
              : <p className={cn(note, "mt-1")}>이 시스템에서 승인받은 유효 권한이 없습니다.</p>}
          </div>
        </div>
        <label className={cn(field, "col-span-full")}>신청 사유<textarea className={input} name="reason" rows={2} maxLength={2000} placeholder="업무상 왜 필요한지" /></label>
        <label className={field}>사용 시작일<input className={input} type="date" name="period_start" /></label>
        <label className={field}>사용 종료일<input className={input} type="date" name="period_end" /></label>
        <div className={cn(formActions, "col-span-full")}>
          <span className={msg.ok ? formMsgOk : formMsg} id="req-form-msg">{msg.text}</span>
          <button type="submit" className={cn(actionButton, primaryButton)} disabled={!o.value || create.isPending}>신청</button>
        </div>
      </form>
    </section>
  );
}

// 내 신청 목록 줄의 [철회] — 1차 결재 전에만 보입니다. 결과 문구는 목록 제목 줄에 뜹니다.
export function WithdrawButton({ r }: { r: RequestRow }) {
  const action = useRequestAction();
  if (!canWithdraw(r)) return null;
  const withdraw = () => {
    if (confirm(`${r.request_no} 신청을 철회합니다.`)) action.mutate({ no: r.request_no, act: "withdraw" });
  };
  return (
    <button type="button" className="self-start border-none bg-transparent p-0 text-[11px] font-medium text-ink-dim underline hover:text-ink disabled:cursor-progress" disabled={action.isPending} onClick={withdraw}>
      철회
    </button>
  );
}

// 신청할 권한 고르기 — 카드를 시스템 순으로 한 격자에 가로로 이어 놓고 하나를 고릅니다 (시스템마다 줄을 나누면 카드가 적은 시스템도 한 줄을 차지해 길어집니다). 카드에는 이름 · 분류 · 설명을 두어 무엇을 하는 권한인지 보고 고르게 하고,
// 보유 중 · 결재 중인 권한은 이유를 달고 막습니다. 고른 카드를 다시 누르면 풉니다. 고른 권한은 숨은 칸(access_code)으로 폼과 함께 보냅니다.
function AccessPicker({ o, q, onQuery, onPick }: { o: AccessOptions; q: string; onQuery: (q: string) => void; onPick: (code: string) => void }) {
  if (o.empty) return <p className={cn(note, "font-normal")}>신청할 수 있는 권한이 없습니다. 보안 총책임자에게 등록을 요청하세요.</p>;
  const items = o.items.filter((a) => matchAccess(a, q));
  return (
    <div className="flex flex-col gap-2.5 font-normal">
      <input type="hidden" name="access_code" value={o.value} />
      {/* 권한이 수십 개로 늘어도 찾을 수 있게 — 이름 · 코드 · 시스템 · 분류 · 설명에서 찾습니다. */}
      <label className={cn(searchBox, "max-w-[320px]")}>
        <Icon name="search" small />
        <input type="search" className={searchInput} placeholder="권한 이름 · 시스템 · 설명으로 찾기" autoComplete="off" value={q} onChange={(e) => onQuery(e.target.value)} />
      </label>
      {items.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2" role="radiogroup" aria-label="신청할 권한">
          {items.map((a) => <AccessCard key={a.code} a={a} reason={o.reason[a.code]} picked={o.value === a.code} onPick={() => onPick(o.value === a.code ? "" : a.code)} />)}
        </div>
      ) : <p className={note}>찾는 권한이 없습니다.</p>}
    </div>
  );
}

// 권한 카드 하나 — 이름, 시스템 · 분류, 설명. 고르면 빨간 테두리 · 옅은 빨간 바탕 (목록에서 고른 줄 · 사이드바의 지금 메뉴와 같은 표시).
function AccessCard({ a, reason, picked, onPick }: { a: AccessItem; reason?: string; picked: boolean; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={picked} disabled={!!reason} onClick={onPick}
      className={cn("flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-ink",
        picked ? "border-risk bg-risk-tint" : "border-line bg-surface hover:border-ink-dim",
        "disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-ink-dim")}>
      <span className="flex w-full items-center gap-1.5 text-[13.5px] font-bold">
        <span className="min-w-0 flex-1">{a.name}</span>
        {reason && <span className="shrink-0 rounded-[99px] bg-line px-1.75 text-[11px] font-semibold">{reason}</span>}
      </span>
      <span className="text-[12px] text-ink-dim">{[a.system || "기타", a.category].filter(Boolean).join(" · ")}</span>
      {a.description && <span className="line-clamp-2 text-[12px] text-ink-dim">{a.description}</span>}
    </button>
  );
}
