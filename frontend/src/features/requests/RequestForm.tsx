import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { accessOptions, periodProblem, type AccessOptions } from "./lib";
import { useCreateRequest } from "./api";
import type { AccessItem } from "@/shared/api/types";
import { DONE_MSG_MS } from "@/app/ui/state/UiContext";
import { useCatalog, useMine } from "@/app/session/data";
import { cn } from "@/shared/lib/cn";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { Icon } from "@/shared/ui/Icon";
import { card, formMsg, formMsgOk, input } from "@/shared/ui/styles";

const EMPTY = { code: "", reason: "", start: "", end: "", open: false };
const LABEL = "mb-1 block text-sm font-medium text-ink-soft";
// 누른 칸은 2px 남색 테두리임 (테두리 1px + 바깥 링 1px)
const FIELD = cn(input, "text-sm focus:border-brand focus:ring-1 focus:ring-brand");
const REQUIRED = <b className="font-medium text-risk">*</b>;
// 신청한 뒤의 일을 적음 — 일반 사용자는 누가 결재하는지, 권한이 언제 다시 검토되는지 모름
const GUIDE = [
  "보안 운영자(1차)와 보안 총책임자(최종)의 결재 후 부여됩니다.",
  "기간이 끝나거나 부서, 직무가 바뀌면 다시 검토될 수 있습니다.",
];

// 현재 보유 권한은 서버가 신청 때 채워서 적지 않음
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
    // 오른쪽 내 신청과 아래 끝을 맞추려 늘고, 남는 자리는 카드 맨 아래에 둠
    <section className={cn(card, "flex flex-1 flex-col p-6")} id="req-form">
      <h2 className="m-0 mb-5 text-lg font-bold">신규 권한 신청서</h2>
      <form id="new-request" className="flex flex-1 flex-col gap-5" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <div>
          <label className={LABEL} htmlFor="req-access" id="req-access-label">필요 권한 {REQUIRED}</label>
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
          <textarea id="req-reason" className={cn(FIELD, "block resize-none p-3")} name="reason" maxLength={2000} rows={3} value={form.reason}
            onChange={(e) => set({ reason: e.target.value })} placeholder="예: 월말 급여 정산 담당으로 급여 테이블 조회가 필요합니다" />
        </div>
        {/* 안내는 신청한 뒤의 일이라 버튼 아래에 — 버튼이 첫 화면에 들어오게 함 */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <button type="button" className="flex-1 rounded-lg border border-line bg-surface py-2.5 text-base font-medium text-ink-soft hover:bg-row-hover"
              onClick={() => { setForm(EMPTY); setMsg({ text: "", ok: false }); }}>초기화</button>
            <button type="submit" className="flex-[2] rounded-lg border-none bg-brand py-2.5 text-base font-bold text-white hover:bg-brand-hover disabled:cursor-progress disabled:opacity-60"
              disabled={create.isPending}>{create.isPending ? "신청하는 중…" : "결재 신청"}</button>
          </div>
          {msg.text && <p className={cn(msg.ok ? formMsgOk : formMsg, "m-0")} id="req-form-msg" role="status">{msg.text}</p>}
          {/* 안내는 칸 사이와 같은 20px 띄움 (버튼 묶음과 구분) */}
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 rounded-lg border border-brand-soft-line bg-brand-soft p-3 text-xs leading-relaxed text-brand" id="req-guide">
            {GUIDE.map((line) => (
              <li key={line} className="flex gap-2"><i className="mt-1.75 inline-block size-1 flex-none rounded-full bg-brand" aria-hidden="true" />{line}</li>
            ))}
          </ul>
        </div>
      </form>
    </section>
  );
}

// 권한이 수백 개라 시스템별로 묶은 고르기 상자임. 이미 가졌거나 결재 중인 권한은 이유를 붙여 고르지 못하게 둠
// 브라우저 기본 고르기 상자는 맥에서 목록을 상자 위에 겹쳐 띄워, 운영체제와 상관없이 상자 아래로 펼치려 직접 그림
function AccessSelect({ o, onPick }: { o: AccessOptions; onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // 시스템을 적지 않은 권한(기타)은 맨 뒤로 둠
  const sys = (a: AccessItem) => a.system || "기타";
  const systems = [...new Set(o.items.map(sys))].sort((x, y) => Number(x === "기타") - Number(y === "기타"));
  const flat = systems.flatMap((system) => o.items.filter((a) => sys(a) === system));
  const usable = flat.flatMap((a, i) => (o.reason[a.code] ? [] : [i]));
  const picked = flat.find((a) => a.code === o.value);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  if (o.empty) return <p className="m-0 text-sm text-ink-dim">신청할 수 있는 권한이 없습니다.</p>;

  // 열면 고른 권한에, 없으면 고를 수 있는 첫 권한에 둠
  const show = () => { setActive(picked ? flat.indexOf(picked) : usable[0] ?? -1); setOpen(true); };
  const close = () => { setOpen(false); button.current?.focus(); };
  const choose = (i: number) => { if (usable.includes(i)) { onPick(flat[i].code); close(); } };
  const step = (by: number) => {
    const at = usable.indexOf(active);
    const next = at < 0 ? (by > 0 ? 0 : usable.length - 1) : Math.min(usable.length - 1, Math.max(0, at + by));
    if (usable[next] != null) setActive(usable[next]);
  };
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => step(1), ArrowUp: () => step(-1),
      Home: () => setActive(usable[0] ?? -1), End: () => setActive(usable.at(-1) ?? -1),
      Enter: () => choose(active), " ": () => choose(active), Escape: close, Tab: () => setOpen(false),
    };
    if (!keys[e.key]) return;
    if (e.key !== "Tab") e.preventDefault();
    keys[e.key]();
  };

  return (
    <>
      <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
        <button ref={button} type="button" id="req-access" name="access_code" aria-haspopup="listbox" aria-expanded={open} aria-controls="req-access-list"
          aria-labelledby="req-access-label req-access-value"
          className={cn(FIELD, "flex h-11 items-center py-2.5 pr-10 pl-2.5 text-left", !picked && "text-ink-dim", open && "border-brand ring-1 ring-brand")}
          // 사파리는 누른 단추에 포커스를 주지 않아, 열린 목록이 먼저 닫혔다가 이 클릭에 다시 열리지 않게 막음
          onMouseDown={(e) => { if (open) e.preventDefault(); }}
          onClick={() => (open ? close() : show())}
          onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(); } }}>
          <span id="req-access-value" className="truncate">{picked ? `${picked.name} (${picked.code})` : "신청할 권한을 고르세요"}</span>
        </button>
        <Icon name="chev" small className={cn("pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-dim transition-transform", open ? "-rotate-90" : "rotate-90")} />
        {open && (
          <ul ref={list} id="req-access-list" role="listbox" tabIndex={-1} aria-labelledby="req-access-label" aria-activedescendant={active >= 0 ? `req-access-${active}` : undefined}
            className="absolute top-full right-0 left-0 z-20 m-0 mt-1 max-h-72 list-none overflow-y-auto rounded-lg border border-line bg-surface p-1 text-sm shadow-[0_8px_24px_rgba(0,0,0,.12)] outline-none"
            onKeyDown={onListKey}>
            {systems.map((system) => (
              <li key={system} role="presentation">
                <span className="block px-2.5 pt-2 pb-1 text-xs font-bold text-ink-dim">{system}</span>
                <ul role="group" aria-label={system} className="m-0 list-none p-0">
                  {flat.map((a, i) => sys(a) !== system ? null : (
                    <li key={a.code} id={`req-access-${i}`} data-i={i} role="option" aria-selected={a.code === o.value} aria-disabled={!!o.reason[a.code]}
                      className={cn("cursor-pointer rounded-md px-2.5 py-2 pl-5 aria-selected:font-bold aria-selected:text-brand",
                        i === active && "bg-brand-soft", o.reason[a.code] && "cursor-default text-ink-faint")}
                      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => !o.reason[a.code] && setActive(i)} onClick={() => choose(i)}>
                      {a.name} ({a.code}){o.reason[a.code] ? ` — ${o.reason[a.code]}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      {picked && (picked.category || picked.description) && (
        <p className="m-0 mt-1.5 text-xs text-ink-dim">{[picked.category, picked.description].filter(Boolean).join(", ")}</p>
      )}
    </>
  );
}
