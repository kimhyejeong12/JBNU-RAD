import { useEffect, useState, type FormEvent } from "react";
import { accessOptions, periodProblem, type AccessOptions } from "./lib";
import { useCreateRequest } from "./api";
import { DONE_MSG_MS } from "@/app/ui/state/UiContext";
import { useCatalog, useMine } from "@/app/session/data";
import { cn } from "@/shared/lib/cn";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { card, formMsg, formMsgOk, input } from "@/shared/ui/base/styles";

const EMPTY = { code: "", reason: "", start: "", end: "", open: false };
const LABEL = "mb-1 block text-sm font-medium text-ink-soft";
const FIELD = cn(input, "text-sm focus:border-brand");
const REQUIRED = <b className="font-medium text-risk">*</b>;
// 신청한 뒤 무엇이 일어나는지 — 일반 사용자는 누가 결재하는지, 권한이 언제 다시 검토되는지 모릅니다.
const GUIDE = [
  "신청한 권한은 보안 운영자(1차)와 보안 총책임자(최종)의 결재를 거쳐 부여됩니다.",
  "사용 기간이 끝나거나 부서, 직무가 바뀌면 권한이 다시 검토되거나 회수될 수 있습니다.",
];

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
    const focus = (name: string) => el.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
    if (!o.value) {
      focus("access_code");
      return setMsg({ text: "필요 권한을 고르세요", ok: false });
    }
    const period = periodProblem(form.start, form.end, form.open);
    if (period) {
      focus("period_end");
      return setMsg({ text: period, ok: false });
    }
    if (!form.reason.trim()) {
      focus("reason");
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
    <section className={cn(card, "flex flex-col p-6")} id="req-form">
      <h2 className="m-0 mb-5 text-lg font-bold">신규 권한 신청서</h2>
      <form id="new-request" className="flex flex-1 flex-col gap-5" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <div>
          <label className={LABEL} htmlFor="req-access">필요 권한 {REQUIRED}</label>
          <AccessSelect o={o} onPick={(code) => set({ code })} />
        </div>
        <div>
          <span className={LABEL}>사용 기간 {REQUIRED}</span>
          <div className="flex items-center gap-2">
            <input className={cn(FIELD, "p-2")} type="date" name="period_start" aria-label="사용 시작일" value={form.start} onChange={(e) => set({ start: e.target.value })} />
            <span className="text-ink-faint">~</span>
            <input className={cn(FIELD, "p-2")} type="date" name="period_end" aria-label="사용 종료일" value={form.open ? "" : form.end} disabled={form.open}
              onChange={(e) => set({ end: e.target.value })} />
          </div>
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-dim">
            <input type="checkbox" className="size-4 accent-brand" checked={form.open} onChange={(e) => set({ open: e.target.checked })} />기한 없음
          </label>
        </div>
        <div>
          <label className={LABEL} htmlFor="req-reason">신청 사유 {REQUIRED}</label>
          <textarea id="req-reason" className={cn(FIELD, "block resize-none p-3")} name="reason" maxLength={2000} rows={4} value={form.reason}
            onChange={(e) => set({ reason: e.target.value })} placeholder="예: 월말 급여 정산 담당으로 급여 테이블 조회가 필요합니다" />
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 rounded-lg border border-brand-soft-line bg-brand-soft p-3 text-xs leading-relaxed text-brand" id="req-guide">
          {GUIDE.map((line) => (
            <li key={line} className="flex gap-2"><i className="mt-[7px] inline-block size-1 flex-none rounded-full bg-brand" aria-hidden="true" />{line}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <button type="button" className="flex-1 rounded-lg border border-line bg-surface py-2.5 text-base font-medium text-ink-soft hover:bg-row-hover"
              onClick={() => { setForm(EMPTY); setMsg({ text: "", ok: false }); }}>초기화</button>
            <button type="submit" className="flex-[2] rounded-lg border-none bg-brand py-2.5 text-base font-bold text-white hover:bg-brand-hover disabled:cursor-progress disabled:opacity-60"
              disabled={create.isPending}>{create.isPending ? "신청하는 중…" : "결재 신청"}</button>
          </div>
          {msg.text && <p className={cn(msg.ok ? formMsgOk : formMsg, "m-0")} id="req-form-msg" role="status">{msg.text}</p>}
        </div>
      </form>
    </section>
  );
}

// 권한이 수백 개라 시스템별로 묶은 고르기 상자입니다. 이미 가졌거나 결재 중인 권한은 이유를 붙여 고르지 못하게 둡니다.
function AccessSelect({ o, onPick }: { o: AccessOptions; onPick: (code: string) => void }) {
  if (o.empty) return <p className="m-0 text-sm text-ink-dim">신청할 수 있는 권한이 없습니다.</p>;
  // 시스템을 적지 않은 권한(기타)은 맨 뒤로 둡니다.
  const systems = [...new Set(o.items.map((a) => a.system || "기타"))].sort((x, y) => Number(x === "기타") - Number(y === "기타"));
  const picked = o.items.find((a) => a.code === o.value);
  return (
    <>
      <select id="req-access" name="access_code" className={cn(FIELD, "h-11 p-2.5", !o.value && "text-ink-dim")} value={o.value} onChange={(e) => onPick(e.target.value)}>
        <option value="" disabled>신청할 권한을 고르세요</option>
        {systems.map((system) => (
          <optgroup key={system} label={system}>
            {o.items.filter((a) => (a.system || "기타") === system).map((a) => (
              <option key={a.code} value={a.code} disabled={!!o.reason[a.code]} className="text-ink">
                {a.name} ({a.code}){o.reason[a.code] ? ` — ${o.reason[a.code]}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {picked && (picked.category || picked.description) && (
        <p className="m-0 mt-1.5 text-xs text-ink-dim">{[picked.category, picked.description].filter(Boolean).join(", ")}</p>
      )}
    </>
  );
}
