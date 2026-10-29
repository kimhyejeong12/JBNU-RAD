import { useLayoutEffect, useRef, type FormEvent } from "react";
import { ASK } from "./config";
import { Evidence } from "./Evidence";
import { askMode, askWaitLabel } from "./lib";
import { useAsk } from "./useAsk";
import { useUi } from "@/app/ui/state/UiContext";
import { useNow } from "@/shared/lib/hooks";

// 질의 — 정책 질의(Answer)도 로그 질의도 등급이 없으므로 등급 배지를 달지 않습니다.
// 내 지난 질의가 먼저 보이고 새 질의는 아래에 붙습니다. 보내는 동안 입력을 막고 경과 시간을 띄웁니다.
export function AskTab() {
  const { ui, setAskSource, openDrawer, dispatch } = useUi();
  const mode = askMode(ui.view);
  const cfg = ASK[mode];
  const { list, busy, ask } = useAsk(mode);
  const now = useNow(1000, busy);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // 새 질의가 붙거나 답이 오면 맨 아래로
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
    if (el && ask(el.value)) el.value = "";
  }

  return (
    <section className="card ask" id="view-ask" role="tabpanel" aria-labelledby="tab-ask">
      <div className="ask-log" id="ask-log" aria-live="polite" ref={log}>
        {!list.length ? <div className="empty">{cfg.empty}<br />답변에 수십 초 이상 걸릴 수 있습니다.</div> : list.map((m, i) => (
          <div className="qa" key={m.id}>
            <p className="qa-q"><span className="no">Q{i + 1}</span><span>{m.q}</span></p>
            {m.started ? <div className="box wait" id="ask-wait">{askWaitLabel(m.started, now)}</div>
              : m.failed ? <div className="box fail">{m.answer}</div>
                : <div className="box">{m.answer}</div>}
            {!m.started && !m.failed && (
              <Evidence kind={mode} m={m} i={i} pressed={(n) => !!ui.askSource && ui.askSource.i === i && ui.askSource.n === n} onToggle={(n) => toggle(i, n)} />
            )}
          </div>
        ))}
      </div>
      <div className="ask-foot">
        <div className="ask-ex" id="ask-ex">
          <span className="label">예시</span>
          {cfg.examples.map((q) => <button type="button" key={q} disabled={busy} onClick={() => ask(q)}>{q}</button>)}
        </div>
        <form className="ask-form" id="ask-form" onSubmit={submit}>
          <input id="ask-input" ref={input} type="text" maxLength={500} autoComplete="off" aria-label="질문" placeholder={cfg.placeholder} autoFocus />
          <button type="submit" id="ask-send" disabled={busy}>질의</button>
        </form>
      </div>
    </section>
  );
}
