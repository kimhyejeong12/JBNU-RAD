import { useState, type FormEvent } from "react";
import { accessOptions, type AccessOptions } from "./lib";
import { useCreateRequest } from "./api";
import { useCatalog, useMine } from "@/app/session/data";
import { isActive } from "@/shared/lib/request";
import { cn } from "@/shared/lib/cn";
import { actionButton, card, field, formActions, formGrid, formMsg, formMsgOk, input, note, primaryButton } from "@/shared/ui/base/styles";

// 일반 사용자의 권한 신청서 — 권한은 권한 목록의 켜진 권한에서 고르고, 현재 보유 권한은 적지 않고 보여주기만 합니다.
// (서버도 신청 때 같은 조건으로 읽어 신청 행에 남깁니다.)
export function RequestForm({ hidden }: { hidden: boolean }) {
  const catalog = useCatalog();
  const mine = useMine();
  const create = useCreateRequest();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: false });

  const o = accessOptions(catalog, mine, code);
  const chosen = catalog.find((x) => x.code === o.value);
  const hint = chosen ? chosen.description || "" : catalog.some((x) => x.is_active) ? "" : "신청할 수 있는 권한이 없습니다. 보안 총책임자에게 등록을 요청하세요.";
  const held = mine.filter((r) => isActive(r));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    create.mutate(Object.fromEntries(new FormData(form)), {
      onSuccess: (made) => {
        form.reset();
        setCode("");
        setMsg({ text: `${made.request_no} 신청했습니다. 보안 운영자의 1차 결재를 기다립니다.`, ok: true });
      },
      onError: (err) => setMsg({ text: err.message, ok: false }),
    });
  }

  return (
    <section className={card} id="req-form" hidden={hidden}>
      <h3 className="m-0 px-[18px] pt-4 pb-2 text-[15.5px] font-bold">권한 신청</h3>
      <form id="new-request" className={formGrid} onSubmit={onSubmit}>
        <label className={cn(field, "col-span-full")}>
          <span>신청할 권한 <b className="text-risk">*</b></span>
          <AccessSelect o={o} onChange={setCode} />
          <span className={note} id="req-access-note">{hint}</span>
        </label>
        <div className="col-span-full grid gap-1.5">
          <span className="text-[12.5px] font-semibold text-ink-dim">현재 보유 권한</span>
          <div id="req-held">
            {held.length
              ? <ul className="mx-0 mt-1 mb-0 pl-[18px] text-[13px]">{held.map((r) => <li key={r.request_no}>{r.requested_access}{" "}<span className={cn(note, "mt-1")}>{r.period_end ? `${r.period_end}까지` : "기간 없음"}</span></li>)}</ul>
              : <p className={cn(note, "mt-1")}>이 시스템에서 승인받은 유효 권한이 없습니다.</p>}
          </div>
        </div>
        <label className={cn(field, "col-span-full")}>신청 사유<textarea className={input} name="reason" rows={2} maxLength={2000} placeholder="업무상 왜 필요한지" /></label>
        <label className={field}>사용 시작일<input className={input} type="date" name="period_start" /></label>
        <label className={field}>사용 종료일<input className={input} type="date" name="period_end" /></label>
        <div className={cn(formActions, "col-span-full")}>
          <span className={msg.ok ? formMsgOk : formMsg} id="req-form-msg">{msg.text}</span>
          <button type="submit" className={cn(actionButton, primaryButton)} disabled={o.empty}>신청</button>
        </div>
      </form>
    </section>
  );
}

// 신청할 권한 고르기 — 시스템별로 묶고, 보유 중 · 결재 중인 권한은 이유와 함께 막습니다.
function AccessSelect({ o, onChange }: { o: AccessOptions; onChange: (code: string) => void }) {
  return (
    <select className={input} name="access_code" id="req-access" required value={o.value} disabled={o.empty} onChange={(e) => onChange(e.target.value)}>
      {o.empty ? <option value="">신청할 수 있는 권한이 없습니다</option> : (
        <>
          <option value="">권한을 고르세요</option>
          {o.groups.map(([sys, list]) => (
            <optgroup key={sys} label={sys}>
              {list.map((a) => (
                <option key={a.code} value={a.code} disabled={!!o.reason[a.code]}>
                  {a.name}{a.category ? ` · ${a.category}` : ""}{o.reason[a.code] ? ` (${o.reason[a.code]})` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </>
      )}
    </select>
  );
}
