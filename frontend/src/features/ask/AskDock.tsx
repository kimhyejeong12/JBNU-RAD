import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ASK, ASK_TOPICS, askWaitLabel, stepText, toolIcon, toolLabel, useAsk } from "@/features/ask/lib";
import { AskEvidence } from "./AskEvidence";
import { useMe } from "@/app/session/me";
import { useConversations } from "@/app/session/data";
import { newConversation } from "@/app/ui/state/uiReducer";
import { useUi } from "@/app/ui/state/UiContext";
import type { AskItem } from "@/shared/api/types";
import { useNow, useEscape } from "@/shared/lib/hooks";
import { ago } from "@/shared/lib/format";
import { Dropdown } from "@/shared/ui/Dropdown";
import { cn } from "@/shared/lib/cn";
import { Icon, LogoMark } from "@/shared/ui/Icon";
import { chip, chipTone, note } from "@/shared/ui/styles";

// 메신저 모양 — 흰 머리에 남색 제목, 회색 바탕에 봇 말풍선(흰색, 왼쪽)과 내 말풍선(연한 남색, 오른쪽). 진한 남색은 보내기 단추만
const BOT = "min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-surface px-3.5 py-2.5 text-[13.5px] leading-relaxed";
const BOT_FAIL = cn(BOT, "border-warn bg-warn-tint text-warn");
const ME = "max-w-[85%] self-end rounded-2xl rounded-tr-sm border border-brand-soft-line bg-brand-soft px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap text-brand";
// 챗봇 프로필 — 머리 로고와 같은 빨간 방패, 바탕은 아주 연한 남색 (남색을 중간 밝기로 올리면 회색이 섞여 탁함)
const AVATAR = "flex size-8 flex-none items-center justify-center rounded-full bg-brand-soft-line";
const CHECKS = "m-0 mt-2 flex items-start gap-1 rounded-lg bg-warn-tint px-2.5 py-1.5 text-[12px] text-warn";
// 분류 타일 — 작은 타일이라 고른 표시는 1px 남색 테두리 (숫자 타일의 2px 는 두꺼워 보임)
const TOPIC = "flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-1 pt-2.5 pb-2 text-[12px] font-semibold whitespace-nowrap text-ink-soft hover:bg-row-hover aria-pressed:border-brand aria-pressed:text-brand";
const EXAMPLE = "self-start rounded-full border border-line bg-surface px-3.5 py-1.5 text-left text-[13px] text-ink hover:border-brand hover:text-brand disabled:cursor-progress disabled:opacity-50";
// 머리의 기호 단추
const HEAD_ICON = "flex size-8 flex-none items-center justify-center rounded-[7px] border-0 bg-transparent text-ink-dim hover:bg-canvas hover:text-ink aria-expanded:bg-canvas aria-expanded:text-ink disabled:opacity-40 disabled:hover:bg-transparent";
const LAUNCHER = "fixed right-5 bottom-5 z-40 flex size-13 items-center justify-center rounded-full border-0 bg-brand text-white shadow-[0_8px_24px_rgba(0,0,0,.22)] hover:opacity-90";
const POPUP = "fixed right-5 bottom-21 z-60 flex h-[min(660px,calc(100vh-112px))] w-[min(460px,calc(100vw-40px))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_16px_40px_rgba(0,0,0,.2)] phone:inset-0 phone:h-auto phone:w-auto phone:rounded-none phone:border-0";

// 어느 화면에서든 오른쪽 아래 버튼으로 여는 질의 에이전트임
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

  // 다른 Esc 동작(패널 닫기)보다 먼저 받아 근거 → 대화 → 닫기 순으로 물러남
  useEscape(() => (ui.askSource ? setAskSource(null) : setAskOpen(false)), true);

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
      <div className="flex items-center gap-1 border-b border-line bg-surface px-3 py-2.5" data-tip-instant>
        {evidence ? (
          <button type="button" className="mr-auto flex items-center gap-1 rounded-[7px] border-0 bg-transparent px-2 py-1.5 text-[13px] font-semibold text-brand hover:bg-canvas" id="ask-back" onClick={() => setAskSource(null)}>
            <Icon name="back" small />대화
          </button>
        ) : (
          <>
            {/* 방패는 답 옆 챗봇 프로필에만 — 머리에도 두면 겹쳐 보임 */}
            <span className="mr-auto pl-1.5 text-[14.5px] font-bold text-brand">SentinelAI 질의</span>
            <Dropdown id="ask-history" label="지난 대화" small bare buttonClass={HEAD_ICON} listClass="left-auto w-72" disabled={!conversations.length}
              value={saved ? ui.conversation : ""} onPick={setConversation} shown={<Icon name="clock" small />}
              options={conversations.map((c) => ({
                value: c.conversation_id,
                label: (
                  <span className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate">{c.question}{c.turns > 1 ? ` (${c.turns})` : ""}</span>
                    <span className="flex-none text-[11.5px] font-normal text-ink-dim tabular-nums">{ago(c.asked_at)}</span>
                  </span>
                ),
              }))} />
            <button type="button" className={HEAD_ICON} id="ask-new" aria-label="새 대화" data-tip="새 대화" disabled={!list.length} onClick={() => setConversation(newConversation())}><Icon name="chatPlus" small /></button>
          </>
        )}
        <button type="button" className={HEAD_ICON} aria-label="닫기" onClick={() => setAskOpen(false)}><Icon name="close" small /></button>
      </div>
      {evidence ? <div className="min-h-0 flex-1 overflow-auto"><AskEvidence list={list} /></div> : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto bg-canvas px-4 py-4" id="ask-log" aria-live="polite" ref={log}>
            {!list.length ? <Examples busy={busy} onAsk={ask} /> : list.map((m, i) => (
              <Turn key={m.id} m={m} now={now} pressed={(n) => !!ui.askSource && ui.askSource.i === i && ui.askSource.n === n} onToggle={(n) => toggle(i, n)} />
            ))}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-line bg-surface px-3.5 py-3">
            <form className="flex items-center gap-1 rounded-full border border-line bg-surface py-1 pr-1 pl-4 focus-within:border-brand" id="ask-form" onSubmit={submit}>
              <input id="ask-input" className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-[13.5px] text-ink outline-none font-[inherit] [font-weight:inherit] leading-[inherit]" ref={input} type="text" maxLength={500} autoComplete="off" aria-label="질문" placeholder={ASK.placeholder} autoFocus onInput={() => setHint("")} />
              <button type="submit" className="flex size-8 flex-none items-center justify-center rounded-full border-0 bg-brand text-white hover:bg-brand-hover disabled:cursor-progress disabled:bg-canvas disabled:text-ink-dim" id="ask-send" aria-label="질의" disabled={busy}><Icon name="send" small /></button>
            </form>
            {hint && <p className={cn(note, "m-0 pl-4 text-risk")}>{hint}</p>}
          </div>
        </>
      )}
    </section>
  );
}

// 봇 말 한 줄 — 왼쪽 방패 기호 옆 말풍선
const Bot = ({ children }: { children: ReactNode }) => (
  <div className="flex items-start gap-2"><span className={AVATAR}><LogoMark className="size-5" /></span>{children}</div>
);

// 빈 대화 — 인사 말풍선, 분류 타일을 고르면 그 분류의 예시 질문, 누르면 바로 질의함
function Examples({ busy, onAsk }: { busy: boolean; onAsk: (q: string) => void }) {
  const [topic, setTopic] = useState(ASK_TOPICS[0]);
  return (
    <div className="flex flex-col gap-3">
      <Bot><p className={cn(BOT, "m-0 flex-none font-semibold")}>{ASK.empty}</p></Bot>
      <div className="grid grid-cols-5 gap-2 pl-10" id="ask-topics" role="group" aria-label="분류">
        {ASK_TOPICS.map((t) => (
          <button type="button" key={t.label} className={TOPIC} aria-pressed={t === topic} onClick={() => setTopic(t)}>
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon name={t.icon} /></span>{t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 pl-10" id="ask-ex">
        {topic.questions.map((q) => <button type="button" key={q} className={EXAMPLE} disabled={busy} onClick={() => onAsk(q)}>{q}</button>)}
      </div>
    </div>
  );
}

// 한 턴 — 내 질문(오른쪽 남색) 다음 답 말풍선, 그 안에 확인 필요 · 근거 칩
function Turn({ m, now, pressed, onToggle }: { m: AskItem; now: number; pressed: (n: number) => boolean; onToggle: (n: number) => void }) {
  const steps = m.steps ?? [];
  return (
    <div className="flex flex-col gap-3">
      <p className={cn(ME, "m-0")}>{m.q}</p>
      <Bot>
        {m.started ? <div className={cn(BOT, "text-ink-dim")} id="ask-wait">{askWaitLabel(m.started, now)}</div>
          : m.failed ? <div className={BOT_FAIL}>{m.answer || `질의 실패: ${m.error ?? "알 수 없는 오류"}`}</div>
            : (
              <div className={BOT}>
                <p className="m-0 whitespace-pre-wrap">{m.answer}</p>
                {!!m.checks?.length && <p className={CHECKS} role="note"><Icon name="warn" small className="mt-0.5 flex-none" />확인 필요: {m.checks.join(", ")}</p>}
                {steps.length ? (
                  <div className="mt-2.5 flex flex-col gap-1.5 border-t border-line pt-2.5" aria-label="찾은 근거">
                    <span className="text-[11.5px] font-semibold text-ink-dim">근거{m.elapsed_sec != null ? ` (${m.elapsed_sec}초)` : ""}</span>
                    <div className="flex flex-row flex-wrap gap-1.5">
                      {steps.map((s, n) => (
                        <button key={n} className={cn(chip, chipTone(pressed(n)), "w-auto", s.error && "text-warn")} aria-pressed={pressed(n)} onClick={() => onToggle(n)}>
                          <Icon name={toolIcon(s)} small /><span className="font-semibold whitespace-nowrap">{toolLabel(s)}</span><span>{stepText(s)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : <p className={cn(note, "mt-2")}>근거 없음</p>}
              </div>
            )}
      </Bot>
    </div>
  );
}
