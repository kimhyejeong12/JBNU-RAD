import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KIND, mergeWatch, pickPeople, revokeReason, status, summarize, type Flag, type Person, type Pick } from "./lib";
import { usePeople } from "@/app/session/data";
import { ask } from "@/app/ui/ask";
import { useUi } from "@/app/ui/state/UiContext";
import { send } from "@/shared/api/http";
import { riskPeopleQuery } from "@/shared/api/queries";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/Icon";
import { Meta, Tile } from "@/shared/ui/parts";
import { box, card, cardCount, cardHead, cardTitle, empty, levelText, note, toolButton } from "@/shared/ui/styles";

export function RiskTab() {
  const q = useQuery(riskPeopleQuery());
  // 타일을 누르면 그 까닭으로 거르고, 다시 누르면 전체입니다.
  const [pick, setPick] = useState<Pick | null>(null);
  const d = q.data;
  const watch = usePeople();
  const people = mergeWatch(d?.people ?? [], watch);
  const sum = summarize(people);
  const shown = pickPeople(people, pick);
  const tile = (k: Pick) => ({ pressed: pick === k, onClick: () => setPick(pick === k ? null : k) });
  return (
    <div className="flex flex-col gap-3.5" id="view-risk" role="tabpanel" aria-labelledby="tab-risk">
      <section className={card}>
        <div className={cardHead}>
          <h3 className={cardTitle}>권한 변동</h3>
          <span className={cardCount} id="risk-updated">
            {q.isError ? q.error.message : d ? stamp(d.generated_at) : ""}
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 px-4.5 pb-4" id="risk-tiles">
          <Tile label="위험" big={`${sum.danger}명`} tone={sum.danger ? levelText["위험"] : undefined} {...tile("danger")}>주의 {sum.caution}명</Tile>
          <Tile label="부서 이동" big={`${sum.moved}명`} {...tile("moved")}>맞지 않는 권한 {sum.grants}명</Tile>
          <Tile label="이동 뒤 이상 행동" big={`${sum.events}명`} {...tile("events")} />
          <Tile label="만료 권한 미회수" big={`${sum.expired}명`} {...tile("expired")} />
          <Tile label="퇴사" big={`${sum.left}명`} {...tile("left")} />
        </div>
        {d?.log_error && <p className={cn(note, "px-4.5 pb-3 text-risk")}>로그 읽기 실패: {d.log_error}</p>}
      </section>
      {d && !shown.length && <section className={cn(card, empty)}>{people.length ? "해당 없음" : "권한 변동 없음"}</section>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3.5 phone:grid-cols-[1fr]">
        {shown.map((p) => <PersonCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}

function PersonCard({ p }: { p: Person }) {
  const { gotoRequest, gotoEvent, navigate, openLogs } = useUi();
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const revoke = useMutation({
    mutationFn: ({ no, reason }: { no: string; reason: string }) => send(`/api/requests/${encodeURIComponent(no)}/revoke`, { reason }),
    onSuccess: (_, v) => setMsg(`✓ ${v.no} 회수했습니다`),
    onError: (e) => setMsg(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
  const onRevoke = async (f: Flag, reason: string) => {
    const ok = await ask({ title: "권한 회수", message: `${p.name}: ${f.text}\n사유: ${reason}`, confirm: "회수", danger: true });
    if (ok) revoke.mutate({ no: f.request_no!, reason });
  };
  const logs = () => {
    navigate("events");
    openLogs({ user: p.log_user, period: "month" });
  };
  return (
    <article className={cn(card, "flex flex-col gap-2.5 px-4.5 py-4")} data-person={p.login_id}>
      <header className="flex items-start gap-2.5">
        <Icon name={LEVEL_ICON[p.level]} className={cn("mt-0.5 size-6 shrink-0", levelText[p.level])} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[15px] font-bold">{p.name} <span className="font-normal text-ink-dim">({p.login_id})</span></p>
          <p className="m-0 text-[12.5px] text-ink-dim"><Meta items={[p.department || "부서 없음", p.job]} /></p>
        </div>
        <span className={cn("text-[13px] font-extrabold", levelText[p.level])}>{p.level}</span>
      </header>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-dim">
        <span className="rounded-md bg-canvas px-2 py-0.5 font-semibold text-ink">{status(p)}</span>
        {p.log_user && <button className={toolButton} onClick={logs}><Icon name="search" small />로그 조회</button>}
      </div>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {p.flags.map((f, n) => {
          const reason = revokeReason(f);
          return (
            <li key={n} className={cn(box, "flex flex-wrap items-start gap-2")}>
              <Icon name={LEVEL_ICON[f.level]} className={cn("mt-0.5 size-4 shrink-0", levelText[f.level])} />
              <span className="min-w-0 flex-1">
                <small className="block text-[11px] text-ink-faint"><Meta items={[KIND[f.kind], f.at, f.request_no]} /></small>
                {f.text}
              </span>
              <span className="flex gap-1.5">
                {f.request_no && <button className={toolButton} onClick={() => gotoRequest(f.request_no!)}>신청 보기</button>}
                {f.event_key && <button className={toolButton} onClick={() => gotoEvent(`event:${f.event_key}`)}>판정 보기</button>}
                {reason && <button className={cn(toolButton, "text-risk")} disabled={revoke.isPending} onClick={() => onRevoke(f, reason)}>회수</button>}
              </span>
            </li>
          );
        })}
      </ul>
      {msg && <p className={cn(note, msg.startsWith("✓") ? "text-ok" : "text-risk")} role="status">{msg}</p>}
    </article>
  );
}
