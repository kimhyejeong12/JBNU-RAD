import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ASK } from "./config";
import { AskEvidence } from "./AskEvidence";
import { askWaitLabel, stepText, toolIcon, toolLabel } from "./lib";
import { useAsk } from "./useAsk";
import { useMe } from "@/app/session/me";
import { useConversations } from "@/app/session/data";
import { newConversation } from "@/app/ui/state/uiReducer";
import { useUi } from "@/app/ui/state/UiContext";
import type { AskItem } from "@/shared/api/types";
import { useNow } from "@/shared/lib/hooks";
import { stamp } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { box, chip, chipTone, empty, note, toolButton } from "@/shared/ui/base/styles";

const ANSWER = cn(box, "whitespace-pre-wrap");
const ANSWER_WAIT = cn(ANSWER, "text-ink-dim");
const ANSWER_FAIL = cn(ANSWER, "bg-warn-tint text-warn");
const CHECKS = "m-0 rounded-lg border border-warn bg-warn-tint px-3.25 py-2 text-[12.5px] text-warn";
const EXAMPLE = "rounded-[99px] border border-line bg-surface px-3 py-1 text-left text-[12px] text-ink-dim hover:border-ink-dim hover:text-ink disabled:cursor-progress disabled:border-line disabled:text-ink-dim disabled:opacity-50";
const SELECT = "h-8 min-w-0 flex-1 rounded-[7px] border border-line bg-surface px-2 text-[12.5px] text-ink";
const LAUNCHER = "fixed right-5 bottom-5 z-40 flex size-13 items-center justify-center rounded-full border-0 bg-ink text-white shadow-[0_8px_24px_rgba(0,0,0,.22)] hover:opacity-90";
const POPUP = "fixed right-5 bottom-21 z-60 flex h-[min(660px,calc(100vh-112px))] w-[min(460px,calc(100vw-40px))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_16px_40px_rgba(0,0,0,.2)] phone:inset-0 phone:h-auto phone:w-auto phone:rounded-none phone:border-0";
const CLOSE = "flex size-8 flex-none items-center justify-center rounded-[7px] border-0 bg-transparent text-ink-dim hover:bg-canvas hover:text-ink";

// 어느 화면에서든 오른쪽 아래 버튼으로 여는 질의 에이전트입니다.
export function AskDock() {
  const me = useMe();
  const { ui, setAskOpen } = useUi();
  const { busy } = useAsk(ui.conversation);
  if (me.role === "user") return null;
  return (
    <>
      {ui.askOpen && <AskPopup />}
      <button className={cn(LAUNCHER, ui.askOpen && "phone:hidden")} id="ask-launcher" aria-label={ui.askOpen ? "질의 닫기" : "질의 열기"}
        aria-expanded={ui.askOpen} aria-controls="ask-popup" onClick={() => setAskOpen(!ui.askOpen)}>
        <Icon name={ui.askOpen ? "close" : "chat"} className="size-6" />
        {busy && !ui.askOpen && <span className="absolute top-0.5 right-0.5 size-3 animate-pulse rounded-full border-2 border-white bg-warn" />}
      </button>
    </>
  );
}

function AskPopup() {
  const { ui, setAskSource, setAskOpen, setConversation } = useUi();
  const conversations = useConversations();
  const { list, busy, ask } = useAsk(ui.conversation);
  const now = useNow(1000, busy);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");
  const saved = conversations.some((c) => c.conversation_id === ui.conversation);
  const evidence = !!ui.askSource && !!list[ui.askSource.i]?.steps?.[ui.askSource.n];

  useLayoutEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, busy, evidence]);

  // 다른 Esc 동작(패널 닫기)보다 먼저 받아 근거 → 대화 → 닫기 순으로 물러납니다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (ui.askSource) setAskSource(null);
      else setAskOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ui.askSource, setAskSource, setAskOpen]);

  const toggle = (i: number, n: number) => {
    const same = !!ui.askSource && ui.askSource.i === i && ui.askSource.n === n;
    setAskSource(same ? null : { i, n });
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const el = input.current;
    if (!el) return;
    if (!el.value.trim()) {
      el.focus();
      return setHint("질문을 입력하세요");
    }
    if (ask(el.value)) el.value = "";
  }

  return (
    <section className={POPUP} id="ask-popup" role="dialog" aria-label="질의">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        {evidence ? (
          <button type="button" className={cn(toolButton, "ml-0")} id="ask-back" onClick={() => setAskSource(null)}>
            <Icon name="back" small />대화
          </button>
        ) : (
          <>
            <span className="flex-none text-[14px] font-bold">질의</span>
            <select className={SELECT} id="ask-history" aria-label="지난 대화" value={saved ? ui.conversation : ""}
              onChange={(e) => e.target.value && setConversation(e.target.value)}>
              <option value="">{saved ? "지난 대화" : list.length ? "지금 대화" : "새 대화"}</option>
              {conversations.map((c) => (
                <option key={c.conversation_id} value={c.conversation_id}>{stamp(c.asked_at)}  {c.question}{c.turns > 1 ? ` (${c.turns})` : ""}</option>
              ))}
            </select>
            <button type="button" className={cn(toolButton, "ml-0")} id="ask-new" disabled={!list.length} onClick={() => setConversation(newConversation())}>새 대화</button>
          </>
        )}
        <button type="button" className={cn(CLOSE, "ml-auto")} aria-label="닫기" onClick={() => setAskOpen(false)}><Icon name="close" small /></button>
      </div>
      {evidence ? <div className="min-h-0 flex-1 overflow-auto"><AskEvidence list={list} /></div> : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4.5 py-3.5" id="ask-log" aria-live="polite" ref={log}>
            {!list.length ? (
              <>
                <div className={empty}>{ASK.empty}</div>
                <div className="flex flex-wrap gap-1.5" id="ask-ex">
                  {ASK.examples.map((q) => <button type="button" key={q} className={EXAMPLE} disabled={busy} onClick={() => ask(q)}>{q}</button>)}
                </div>
              </>
            ) : list.map((m, i) => (
              <Turn key={m.id} m={m} i={i} now={now} pressed={(n) => !!ui.askSource && ui.askSource.i === i && ui.askSource.n === n} onToggle={(n) => toggle(i, n)} />
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-line px-3.5 pt-3 pb-3.5">
            <form className="flex gap-2" id="ask-form" onSubmit={submit}>
              <input id="ask-input" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-0 text-[14px] text-ink outline-none font-[inherit] [font-weight:inherit] leading-[inherit] focus:border-ink" ref={input} type="text" maxLength={500} autoComplete="off" aria-label="질문" placeholder={ASK.placeholder} autoFocus onInput={() => setHint("")} />
              <button type="submit" className="h-10 flex-none rounded-lg border-0 bg-ink px-4 py-0 font-bold text-white disabled:cursor-progress disabled:bg-canvas disabled:text-ink-dim" id="ask-send" disabled={busy}>질의</button>
            </form>
            {hint && <p className={cn(note, "m-0 text-risk")}>{hint}</p>}
          </div>
        </>
      )}
    </section>
  );
}

function Turn({ m, i, now, pressed, onToggle }: { m: AskItem; i: number; now: number; pressed: (n: number) => boolean; onToggle: (n: number) => void }) {
  const steps = m.steps ?? [];
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex items-start gap-2 font-bold"><span className="mt-px flex-none text-[11.5px] font-semibold text-ink-dim tabular-nums">Q{i + 1}</span><span>{m.q}</span></p>
      {m.started ? <div className={ANSWER_WAIT} id="ask-wait">{askWaitLabel(m.started, now)}</div>
        : m.failed ? <div className={ANSWER_FAIL}>{m.answer || `질의 실패: ${m.error ?? "알 수 없는 오류"}`}</div>
          : <div className={ANSWER}>{m.answer}</div>}
      {!m.started && !!m.checks?.length && (
        <p className={CHECKS} role="note"><Icon name="warn" small /> 확인 필요: {m.checks.join(", ")}</p>
      )}
      {!m.started && (steps.length ? (
        <div className="flex flex-col gap-1.5" aria-label="찾은 근거">
          <span className="text-[11.5px] font-semibold text-ink-dim">근거{m.elapsed_sec != null ? ` (${m.elapsed_sec}초)` : ""}</span>
          <div className="flex flex-row flex-wrap gap-1.5">
            {steps.map((s, n) => (
              <button key={n} className={cn(chip, chipTone(pressed(n)), "w-auto", s.error && "text-warn")} aria-pressed={pressed(n)} onClick={() => onToggle(n)}>
                <Icon name={toolIcon(s)} small /><span className="font-semibold whitespace-nowrap">{toolLabel(s)}</span><span>{stepText(s)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : !m.failed && <p className={note}>근거 없음</p>)}
    </div>
  );
}
