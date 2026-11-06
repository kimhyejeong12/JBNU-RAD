import { useEffect, useState, type FormEvent } from "react";
import { accessOptions, type AccessOptions } from "./lib";
import { useCreateRequest } from "./api";
import { DONE_MSG_MS } from "@/app/ui/state/UiContext";
import { useCatalog, useMine } from "@/app/session/data";
import type { AccessItem } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { actionButton, card, field, formGrid, formMsg, formMsgOk, input, note, primaryButton } from "@/shared/ui/base/styles";

// 현재 보유 권한은 서버가 신청 때 채워서 적지 않습니다.
export function RequestForm({ hidden }: { hidden: boolean }) {
  const catalog = useCatalog();
  const mine = useMine();
  const create = useCreateRequest();
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: false });

  const o = accessOptions(catalog, mine, code);
  useEffect(() => {
    if (!msg.ok) return;
    const t = setTimeout(() => setMsg({ text: "", ok: false }), DONE_MSG_MS);
    return () => clearTimeout(t);
  }, [msg]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
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
        {/* 한 줄로 늘어놓으면 버튼까지 마우스를 오른쪽 끝으로 옮겨야 해서 위아래로 둡니다. */}
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

// 시스템마다 줄을 나누면 카드가 적은 시스템도 한 줄을 차지해 한 격자에 이어 놓습니다.
function AccessPicker({ o, onPick }: { o: AccessOptions; onPick: (code: string) => void }) {
  if (o.empty) return <p className={cn(note, "font-normal")}>신청할 수 있는 권한이 없습니다.</p>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2 font-normal" role="radiogroup" aria-label="신청할 권한">
      <input type="hidden" name="access_code" value={o.value} />
      {o.items.map((a) => <AccessCard key={a.code} a={a} reason={o.reason[a.code]} picked={o.value === a.code} onPick={() => onPick(o.value === a.code ? "" : a.code)} />)}
    </div>
  );
}

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
      <span className="text-[12px] text-ink-dim">{[a.system || "기타", a.category].filter(Boolean).join(", ")}</span>
      {a.description && <span className="line-clamp-2 text-[12px] text-ink-dim">{a.description}</span>}
    </button>
  );
}
