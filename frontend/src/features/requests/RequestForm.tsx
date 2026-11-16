import { useEffect, useState, type FormEvent } from "react";
import { accessOptions, periodProblem, type AccessOptions } from "./lib";
import { useCreateRequest } from "./api";
import { DONE_MSG_MS } from "@/app/ui/state/UiContext";
import { useCatalog, useMine } from "@/app/session/data";
import type { AccessItem } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { Meta } from "@/shared/ui/base/parts";
import { actionButton, card, field, formMsg, formMsgOk, input, note, primaryButton } from "@/shared/ui/base/styles";

const EMPTY = { code: "", reason: "", start: "", end: "", open: false };

// 현재 보유 권한은 서버가 신청 때 채워서 적지 않습니다.
export function RequestForm() {
  const catalog = useCatalog();
  const mine = useMine();
  const create = useCreateRequest();
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState({ text: "", ok: false });
  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const o = accessOptions(catalog, mine, form.code);
  useEffect(() => {
    if (!msg.ok) return;
    const t = setTimeout(() => setMsg({ text: "", ok: false }), DONE_MSG_MS);
    return () => clearTimeout(t);
  }, [msg]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const focus = (selector: string) => el.querySelector<HTMLElement>(selector)?.focus();
    if (!o.value) {
      focus('[role="radio"]:not(:disabled)');
      return setMsg({ text: "신청할 권한을 고르세요", ok: false });
    }
    const period = periodProblem(form.start, form.end, form.open);
    if (period) {
      focus('input[name="period_end"]');
      return setMsg({ text: period, ok: false });
    }
    if (!form.reason.trim()) {
      focus('textarea[name="reason"]');
      return setMsg({ text: "신청 사유를 입력하세요", ok: false });
    }
    const body = { access_code: o.value, reason: form.reason, period_start: form.start, period_end: form.open ? "" : form.end };
    create.mutate(body, {
      onSuccess: (made) => {
        setForm(EMPTY);
        setMsg({ text: `${made.request_no} 신청했습니다`, ok: true });
      },
      onError: (err) => setMsg({ text: err.message, ok: false }),
    });
  }

  return (
    <section className={cn(card, "flex flex-col")} id="req-form">
      <h3 className="m-0 px-4.5 pt-4 pb-1 text-[15.5px] font-bold">권한 신청</h3>
      <form id="new-request" className="flex flex-col gap-4 px-4.5 pt-2 pb-4.5" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <div className={field}>
          <span>신청할 권한 <b className="text-risk">*</b></span>
          <AccessPicker o={o} onPick={(code) => set({ code })} />
        </div>
        <div className={field}>
          <span>사용 기간 <b className="text-risk">*</b></span>
          <div className="flex items-center gap-2">
            <input className={input} type="date" name="period_start" aria-label="사용 시작일" value={form.start} onChange={(e) => set({ start: e.target.value })} />
            <span className="text-ink-faint">~</span>
            <input className={input} type="date" name="period_end" aria-label="사용 종료일" value={form.open ? "" : form.end} disabled={form.open}
              onChange={(e) => set({ end: e.target.value })} />
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-1.5 font-normal text-ink-soft">
            <input type="checkbox" className="size-3.5 accent-brand" checked={form.open} onChange={(e) => set({ open: e.target.checked })} />기한 없음
          </label>
        </div>
        <label className={field}>
          <span>신청 사유 <b className="text-risk">*</b></span>
          <textarea className={cn(input, "min-h-24 resize-y")} name="reason" maxLength={2000} rows={4} value={form.reason}
            onChange={(e) => set({ reason: e.target.value })} placeholder="예: 월말 급여 정산 담당으로 급여 테이블 조회가 필요합니다" />
        </label>
        <div className="flex flex-col gap-2">
          <p className={cn(note, "m-0")}><Meta items={["결재", "보안 운영자 → 보안 총책임자"]} /></p>
          <div className="flex gap-2">
            <button type="button" className={cn(actionButton, "flex-1")} onClick={() => { setForm(EMPTY); setMsg({ text: "", ok: false }); }}>초기화</button>
            <button type="submit" className={cn(actionButton, primaryButton, "flex-[2]")} disabled={create.isPending}>{create.isPending ? "신청하는 중…" : "신청"}</button>
          </div>
          {msg.text && <p className={cn(msg.ok ? formMsgOk : formMsg, "m-0")} id="req-form-msg" role="status">{msg.text}</p>}
        </div>
      </form>
    </section>
  );
}

// 시스템마다 묶어 한 줄씩 — 좁은 칸에서도 이름 · 분류를 다 읽게 합니다. 이미 가졌거나 결재 중인 권한은 이유와 함께 흐리게 둡니다.
function AccessPicker({ o, onPick }: { o: AccessOptions; onPick: (code: string) => void }) {
  if (o.empty) return <p className={cn(note, "font-normal")}>신청할 수 있는 권한이 없습니다.</p>;
  // 시스템을 적지 않은 권한(기타)은 맨 뒤로 둡니다.
  const systems = [...new Set(o.items.map((a) => a.system || "기타"))].sort((x, y) => Number(x === "기타") - Number(y === "기타"));
  return (
    <div className="flex max-h-90 flex-col gap-3 overflow-y-auto font-normal" role="radiogroup" aria-label="신청할 권한">
      {systems.map((system) => (
        <div key={system} className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold text-ink-faint">{system}</span>
          {o.items.filter((a) => (a.system || "기타") === system).map((a) => (
            <AccessRow key={a.code} a={a} reason={o.reason[a.code]} picked={o.value === a.code} onPick={() => onPick(o.value === a.code ? "" : a.code)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function AccessRow({ a, reason, picked, onPick }: { a: AccessItem; reason?: string; picked: boolean; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={picked} disabled={!!reason} onClick={onPick} data-tip={a.description || undefined}
      className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-ink",
        picked ? "border-brand bg-surface shadow-[inset_0_0_0_1px_var(--color-brand)]" : "border-line bg-surface hover:border-ink-dim",
        "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-dim disabled:hover:border-line")}>
      <span className={cn("size-3.5 shrink-0 rounded-full border", picked ? "border-[4px] border-brand" : "border-ink-ghost")} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13.5px] font-semibold">{a.name}</span>
        <span className="truncate text-[12px] text-ink-dim">{[a.category, a.code].filter(Boolean).join(", ")}</span>
      </span>
      {reason && <span className="shrink-0 rounded-[99px] bg-line px-1.75 text-[11px] font-semibold">{reason}</span>}
    </button>
  );
}
