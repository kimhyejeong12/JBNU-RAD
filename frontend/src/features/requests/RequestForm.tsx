import { useEffect, useState, type FormEvent } from "react";
import { accessOptions, type AccessOptions } from "./lib";
import { useCreateRequest } from "./api";
import { DONE_MSG_MS } from "@/app/ui/state/UiContext";
import { useCatalog, useMine } from "@/app/session/data";
import type { AccessItem } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { actionButton, card, field, formGrid, formMsg, formMsgOk, input, note, primaryButton } from "@/shared/ui/base/styles";

// 일반 사용자의 권한 신청서 — 권한은 권한 목록의 켜진 권한을 카드로 펼쳐 놓고 하나를 고릅니다. 이미 가진 권한은 카드의 보유 중 배지(기간 포함)로 보여 주고,
// 현재 보유 권한은 적지 않습니다 (서버가 신청 때 승인된 유효 신청에서 읽어 신청 행에 남깁니다).
export function RequestForm({ hidden }: { hidden: boolean }) {
  const catalog = useCatalog();
  const mine = useMine();
  const create = useCreateRequest();
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: false });

  const o = accessOptions(catalog, mine, code);
  // "신청했습니다" 안내는 잠깐 보이고 저절로 지웁니다 (오류 안내는 다음 신청까지 남김).
  useEffect(() => {
    if (!msg.ok) return;
    const t = setTimeout(() => setMsg({ text: "", ok: false }), DONE_MSG_MS);
    return () => clearTimeout(t);
  }, [msg]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    // 버튼을 꺼 두지 않고, 누르면 빠진 것을 알리고 그 칸으로 커서를 옮깁니다.
    if (!o.value) {
      form.querySelector<HTMLButtonElement>('[role="radio"]:not(:disabled)')?.focus();
      return setMsg({ text: "신청할 권한을 고르세요", ok: false });
    }
    if (!reason.trim()) {
      form.querySelector<HTMLInputElement>('input[name="reason"]')?.focus();
      return setMsg({ text: "신청 사유를 입력하세요", ok: false });
    }
    create.mutate(Object.fromEntries(new FormData(form)), {
      onSuccess: (made) => {
        form.reset();
        setCode("");
        setReason("");
        setMsg({ text: `${made.request_no} 신청했습니다. 보안 운영자의 1차 결재를 기다립니다.`, ok: true });
      },
      onError: (err) => setMsg({ text: err.message, ok: false }),
    });
  }

  return (
    <section className={card} id="req-form" hidden={hidden}>
      <h3 className="m-0 px-4.5 pt-4 pb-2 text-[15.5px] font-bold">권한 신청</h3>
      <form id="new-request" className={formGrid} noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <div className={cn(field, "col-span-full")}>
          <span>신청할 권한 <b className="text-risk">*</b></span>
          <AccessPicker o={o} onPick={setCode} />
        </div>
        {/* 사유 → 사용 기간 · [신청]을 위에서 아래로, 왼쪽 끝을 따라 둡니다 — 한 줄로 늘어놓으면 넓은 화면에서 버튼까지 마우스를 오른쪽 끝으로 옮겨야 해서.
            사유 칸은 문장 하나 쓰기 좋은 폭(720px)까지, 날짜 칸은 날짜 하나 들어갈 폭. */}
        {/* 사유는 필수 — 업무상 필요한지는 결재자가 사유를 보고 판단합니다 (AI 판정은 사유를 보지 않음). */}
        <label className={cn(field, "col-span-full max-w-180")}><span>신청 사유 <b className="text-risk">*</b></span>
          <input className={input} name="reason" maxLength={2000} autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 급여 정산 담당으로 급여 테이블 조회가 필요합니다" />
        </label>
        <div className="col-span-full flex flex-wrap items-end gap-3">
          <label className={cn(field, "w-40")}>사용 시작일<input className={input} type="date" name="period_start" /></label>
          <label className={cn(field, "w-40")}>사용 종료일<input className={input} type="date" name="period_end" /></label>
          <button type="submit" className={cn(actionButton, primaryButton)} disabled={create.isPending}>신청</button>
        </div>
        {msg.text && <p className={cn(msg.ok ? formMsgOk : formMsg, "col-span-full m-0")} id="req-form-msg">{msg.text}</p>}
      </form>
    </section>
  );
}

// 신청할 권한 고르기 — 카드를 시스템 순으로 한 격자에 가로로 이어 놓고 하나를 고릅니다 (시스템마다 줄을 나누면 카드가 적은 시스템도 한 줄을 차지해 길어집니다). 카드에는 이름 · 분류 · 설명을 두어 무엇을 하는 권한인지 보고 고르게 하고,
// 보유 중 · 결재 중인 권한은 이유를 달고 막습니다. 고른 카드를 다시 누르면 풉니다. 고른 권한은 숨은 칸(access_code)으로 폼과 함께 보냅니다.
function AccessPicker({ o, onPick }: { o: AccessOptions; onPick: (code: string) => void }) {
  if (o.empty) return <p className={cn(note, "font-normal")}>신청할 수 있는 권한이 없습니다. 보안 총책임자에게 등록을 요청하세요.</p>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2 font-normal" role="radiogroup" aria-label="신청할 권한">
      <input type="hidden" name="access_code" value={o.value} />
      {o.items.map((a) => <AccessCard key={a.code} a={a} reason={o.reason[a.code]} picked={o.value === a.code} onPick={() => onPick(o.value === a.code ? "" : a.code)} />)}
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
