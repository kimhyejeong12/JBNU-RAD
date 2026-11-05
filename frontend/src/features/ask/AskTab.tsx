import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ASK } from "./config";
import { Evidence } from "./Evidence";
import { askMode, askWaitLabel } from "./lib";
import { useAsk } from "./useAsk";
import { useUi } from "@/app/ui/state/UiContext";
import { useNow } from "@/shared/lib/hooks";
import { cn } from "@/shared/lib/cn";
import { box, card, empty, note } from "@/shared/ui/base/styles";

const ANSWER = cn(box, "whitespace-pre-wrap");
const ANSWER_WAIT = cn(ANSWER, "text-ink-dim");
const ANSWER_FAIL = cn(ANSWER, "bg-warn-tint text-warn");
const EXAMPLE = "rounded-[99px] border border-line bg-surface px-3 py-1 text-left text-[12px] text-ink-dim hover:border-ink-dim hover:text-ink disabled:cursor-progress disabled:border-line disabled:text-ink-dim disabled:opacity-50";

export function AskTab() {
  const { ui, setAskSource, openDrawer, dispatch } = useUi();
  const mode = askMode(ui.view);
  const cfg = ASK[mode];
  const { list, busy, ask } = useAsk(mode);
  const now = useNow(1000, busy);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");

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
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4.5 py-3.5 narrow:max-h-[60vh]" id="ask-log" aria-live="polite" ref={log}>
        {!list.length ? <div className={empty}>{cfg.empty}<br />답변에 수십 초 이상 걸릴 수 있습니다.</div> : list.map((m, i) => (
          <div className="flex flex-col gap-2" key={m.id}>
            <p className="m-0 flex items-start gap-2 font-bold"><span className="mt-px flex-none text-[11.5px] font-semibold text-ink-dim tabular-nums">Q{i + 1}</span><span>{m.q}</span></p>
            {m.started ? <div className={ANSWER_WAIT} id="ask-wait">{askWaitLabel(m.started, now)}</div>
              : m.failed ? <div className={ANSWER_FAIL}>{m.answer}</div>
                : <div className={ANSWER}>{m.answer}</div>}
            {!m.started && !m.failed && (
              <Evidence kind={mode} m={m} i={i} pressed={(n) => !!ui.askSource && ui.askSource.i === i && ui.askSource.n === n} onToggle={(n) => toggle(i, n)} />
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-4.5 pt-3 pb-3.5">
        <div className="flex flex-wrap items-center gap-1.5" id="ask-ex">
          <span className="mr-0.5 text-[11.5px] font-semibold text-ink-dim">예시</span>
          {cfg.examples.map((q) => <button type="button" key={q} className={EXAMPLE} disabled={busy} onClick={() => ask(q)}>{q}</button>)}
        </div>
        <form className="flex gap-2" id="ask-form" onSubmit={submit}>
          <input id="ask-input" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-0 text-[14px] text-ink outline-none font-[inherit] [font-weight:inherit] leading-[inherit] focus:border-ink" ref={input} type="text" maxLength={500} autoComplete="off" aria-label="질문" placeholder={cfg.placeholder} autoFocus onInput={() => setHint("")} />
          <button type="submit" className="h-10 flex-none rounded-lg border-0 bg-ink px-5 py-0 font-bold text-white disabled:cursor-progress disabled:bg-canvas disabled:text-ink-dim" id="ask-send" disabled={busy}>질의</button>
        </form>
        {hint && <p className={cn(note, "m-0 text-risk")}>{hint}</p>}
      </div>
    </section>
  );
}
