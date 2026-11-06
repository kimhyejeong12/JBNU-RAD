import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KIND, filterPeople, revokeReason, status, summarize } from "./lib";
import { ask } from "@/app/ui/confirm/ask";
import { useUi } from "@/app/ui/state/UiContext";
import { send } from "@/shared/api/http";
import { riskPeopleQuery } from "@/shared/api/queries";
import type { Level, WatchFlag, WatchPerson } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { Meta } from "@/shared/ui/base/parts";
import { box, card, cardCount, cardHead, cardTitle, empty, levelText, note, toolButton } from "@/shared/ui/base/styles";

const FILTERS: (Level | "전체")[] = ["전체", "위험", "주의"];
const PILL = "rounded-full border border-line px-2.75 py-1 text-[12.5px] font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white";

export function RiskTab() {
  const q = useQuery(riskPeopleQuery());
  const [level, setLevel] = useState<Level | "전체">("전체");
  const d = q.data;
  const people = d?.people ?? [];
  const sum = summarize(people);
  const shown = filterPeople(people, level);
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
          <Tile label="위험" big={<span className={sum.danger ? "text-risk" : undefined}>{sum.danger}명</span>} note={`주의 ${sum.caution}명`} />
          <Tile label="부서 이동" big={`${sum.moved}명`} note={`맞지 않는 권한 ${sum.grants}명`} />
          <Tile label="이동 뒤 이상 행동" big={`${sum.events}명`} />
          <Tile label="만료 권한 미회수" big={`${sum.expired}명`} />
        </div>
        {d?.log_error && <p className={cn(note, "px-4.5 pb-3 text-risk")}>로그 읽기 실패: {d.log_error}</p>}
      </section>
      <div className="flex items-center gap-1.5" role="group" aria-label="등급 거르기">
        {FILTERS.map((f) => (
          <button key={f} className={PILL} aria-pressed={level === f} onClick={() => setLevel(f)}>{f}</button>
        ))}
      </div>
      {d && !shown.length && <section className={cn(card, empty)}>{people.length ? "해당 없음" : "권한 변동 없음"}</section>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3.5 phone:grid-cols-[1fr]">
        {shown.map((p) => <PersonCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}

function PersonCard({ p }: { p: WatchPerson }) {
  const { gotoRequest, gotoEvent, navigate, openLogs } = useUi();
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  const revoke = useMutation({
    mutationFn: ({ no, reason }: { no: string; reason: string }) => send(`/api/requests/${encodeURIComponent(no)}/revoke`, { reason }),
    onSuccess: (_, v) => setMsg(`✓ ${v.no} 회수했습니다`),
    onError: (e) => setMsg(e.message),
    onSettled: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
  const onRevoke = async (f: WatchFlag, reason: string) => {
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

function Tile({ label, big, note: text }: { label: string; big: ReactNode; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[10px] border border-line px-3.5 py-3">
      <span className="text-[12px] font-semibold text-ink-dim">{label}</span>
      <span className="text-[24px] font-extrabold tracking-[-0.6px]">{big}</span>
      {text && <p className={cn(note, "m-0")}>{text}</p>}
    </div>
  );
}
