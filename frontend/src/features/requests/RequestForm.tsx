import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { accessOptions } from "./accessOptions";
import { useCreateRequest } from "./api";
import { catalogQuery, requestsQuery } from "@/shared/api/queries";
import { isActive } from "@/shared/lib/request";

// 일반 사용자의 권한 신청서 — 권한은 권한 목록의 켜진 권한에서 고르고, 현재 보유 권한은 적지 않고 보여주기만 합니다.
// (서버도 신청 때 같은 조건으로 읽어 신청 행에 남깁니다.)
export function RequestForm({ hidden }: { hidden: boolean }) {
  const catalog = useQuery(catalogQuery()).data ?? [];
  const mine = useQuery(requestsQuery(true)).data ?? [];
  const create = useCreateRequest();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: false });

  const o = accessOptions(catalog, mine, code);
  const chosen = catalog.find((x) => x.code === o.value);
  const note = chosen ? chosen.description || "" : catalog.some((x) => x.is_active) ? "" : "신청할 수 있는 권한이 없습니다. 보안 총책임자에게 등록을 요청하세요.";
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
    <section className="card req-form" id="req-form" hidden={hidden}>
      <h3>권한 신청</h3>
      <form id="new-request" className="form-grid" onSubmit={onSubmit}>
        <label className="wide">
          <span>신청할 권한 <b>*</b></span>
          <select name="access_code" id="req-access" required value={o.value} disabled={o.empty} onChange={(e) => setCode(e.target.value)}>
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
          <span className="note" id="req-access-note">{note}</span>
        </label>
        <div className="wide held">
          <span>현재 보유 권한</span>
          <div id="req-held">
            {held.length
              ? <ul>{held.map((r) => <li key={r.request_no}>{r.requested_access}{" "}<span className="note">{r.period_end ? `${r.period_end}까지` : "기간 없음"}</span></li>)}</ul>
              : <p className="note">이 시스템에서 승인받은 유효 권한이 없습니다.</p>}
          </div>
        </div>
        <label className="wide">신청 사유<textarea name="reason" rows={2} maxLength={2000} placeholder="업무상 왜 필요한지" /></label>
        <label>사용 시작일<input type="date" name="period_start" /></label>
        <label>사용 종료일<input type="date" name="period_end" /></label>
        <div className="wide form-actions">
          <span className={msg.ok ? "form-msg ok" : "form-msg"} id="req-form-msg">{msg.text}</span>
          <button type="submit" className="primary" disabled={o.empty}>신청</button>
        </div>
      </form>
    </section>
  );
}
