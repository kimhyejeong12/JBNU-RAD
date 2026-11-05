import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ASK } from "./config";
import { askWaitLabel, stepText, toolIcon, toolLabel } from "./lib";
import { useAsk } from "./useAsk";
import { useConversations } from "@/app/session/data";
import { newConversation } from "@/app/ui/state/uiReducer";
import { useUi } from "@/app/ui/state/UiContext";
import type { AskItem } from "@/shared/api/types";
import { useNow } from "@/shared/lib/hooks";
import { stamp } from "@/shared/lib/format";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { box, card, chip, chipTone, empty, note, toolButton } from "@/shared/ui/base/styles";

const ANSWER = cn(box, "whitespace-pre-wrap");
const ANSWER_WAIT = cn(ANSWER, "text-ink-dim");
const ANSWER_FAIL = cn(ANSWER, "bg-warn-tint text-warn");
const CHECKS = "m-0 rounded-lg border border-warn bg-warn-tint px-3.25 py-2 text-[12.5px] text-warn";
const EXAMPLE = "rounded-[99px] border border-line bg-surface px-3 py-1 text-left text-[12px] text-ink-dim hover:border-ink-dim hover:text-ink disabled:cursor-progress disabled:border-line disabled:text-ink-dim disabled:opacity-50";
const SELECT = "h-8 min-w-0 max-w-[60%] flex-1 rounded-[7px] border border-line bg-surface px-2 text-[12.5px] text-ink";

export function AskTab() {
  const { ui, setAskSource, setConversation, openDrawer, dispatch } = useUi();
  const conversations = useConversations();
  const { list, busy, ask } = useAsk(ui.conversation);
  const now = useNow(1000, busy);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");
  const saved = conversations.some((c) => c.conversation_id === ui.conversation);

  useLayoutEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, busy]);

  const toggle = (i: number, n: number) => {
    const same = !!ui.askSource && ui.askSource.i === i && ui.askSource.n === n;
    setAskSource(same ? null : { i, n });
    if (same) dispatch({ type: "CLOSE_DRAWER" });
    else openDrawer();
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
    <section className={cn(card, "flex min-h-95 flex-[1_0_0] flex-col narrow:min-h-0 narrow:flex-none")} id="view-ask" role="tabpanel" aria-labelledby="tab-ask">
      <div className="flex items-center gap-2 border-b border-line px-4.5 py-2.5">
        <select className={SELECT} id="ask-history" aria-label="지난 대화" value={saved ? ui.conversation : ""}
          onChange={(e) => e.target.value && setConversation(e.target.value)}>
          <option value="">{saved ? "지난 대화" : list.length ? "지금 대화" : "새 대화"}</option>
          {conversations.map((c) => (
            <option key={c.conversation_id} value={c.conversation_id}>{stamp(c.asked_at)} · {c.question}{c.turns > 1 ? ` (${c.turns})` : ""}</option>
          ))}
        </select>
        <button type="button" className={toolButton} id="ask-new" disabled={!list.length} onClick={() => setConversation(newConversation())}>
          <Icon name="chat" small />새 대화
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4.5 py-3.5 narrow:max-h-[60vh]" id="ask-log" aria-live="polite" ref={log}>
        {!list.length ? <div className={empty}>{ASK.empty}<br />앞 질문을 이어서 물을 수 있습니다. 답변에 수십 초 이상 걸릴 수 있습니다.</div> : list.map((m, i) => (
          <Turn key={m.id} m={m} i={i} now={now} pressed={(n) => !!ui.askSource && ui.askSource.i === i && ui.askSource.n === n} onToggle={(n) => toggle(i, n)} />
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-4.5 pt-3 pb-3.5">
        <div className="flex flex-wrap items-center gap-1.5" id="ask-ex">
          <span className="mr-0.5 text-[11.5px] font-semibold text-ink-dim">예시</span>
          {ASK.examples.map((q) => <button type="button" key={q} className={EXAMPLE} disabled={busy} onClick={() => ask(q)}>{q}</button>)}
        </div>
        <form className="flex gap-2" id="ask-form" onSubmit={submit}>
          <input id="ask-input" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-0 text-[14px] text-ink outline-none font-[inherit] [font-weight:inherit] leading-[inherit] focus:border-ink" ref={input} type="text" maxLength={500} autoComplete="off" aria-label="질문" placeholder={ASK.placeholder} autoFocus onInput={() => setHint("")} />
          <button type="submit" className="h-10 flex-none rounded-lg border-0 bg-ink px-5 py-0 font-bold text-white disabled:cursor-progress disabled:bg-canvas disabled:text-ink-dim" id="ask-send" disabled={busy}>질의</button>
        </form>
        {hint && <p className={cn(note, "m-0 text-risk")}>{hint}</p>}
      </div>
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
        <p className={CHECKS} role="note"><Icon name="warn" small /> 검증에서 걸린 것 — 근거를 열어 확인하세요: {m.checks.join(" · ")}</p>
      )}
      {!m.started && (steps.length ? (
        <div className="flex flex-col gap-1.5" aria-label="찾은 근거">
          <span className="text-[11.5px] font-semibold text-ink-dim">찾은 근거{m.elapsed_sec != null ? ` · ${m.elapsed_sec}초` : ""}</span>
          <div className="flex flex-row flex-wrap gap-1.5">
            {steps.map((s, n) => (
              <button key={n} className={cn(chip, chipTone(pressed(n)), "w-auto", s.error && "text-warn")} aria-pressed={pressed(n)} aria-controls="panel" onClick={() => onToggle(n)}>
                <Icon name={toolIcon(s)} small /><span className="font-semibold whitespace-nowrap">{toolLabel(s)}</span><span>{stepText(s)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : !m.failed && <p className={note}>도구로 찾은 근거가 없습니다.</p>)}
    </div>
  );
}
