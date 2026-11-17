import { useEffect, useRef, useState } from "react";
import { placeTip, pageScale } from "@/app/layout/lib";
import { registerConfirm, type Ask } from "@/app/ui/ask";
import { cn } from "@/shared/lib/cn";
import { actionButton, dangerButton, primaryButton, cardTitle } from "@/shared/ui/styles";
import { useEscape } from "@/shared/lib/hooks";

// 마지막 자식으로 두어 opacity · transform 이 걸린 조상 밑에 들어가지 않게 함
export function TooltipLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const title = tip.querySelector("b");
    const desc = tip.querySelector("span");
    if (!title || !desc) return;
    let target: Element | null = null;
    let timer: number | undefined;

    const show = (el: HTMLElement) => {
      const [head, body] = String(el.dataset.tip || "").split("|");
      if (!head) return;
      target = el;
      title.style.display = body ? "" : "none";
      title.textContent = body ? head : "";
      desc.textContent = body || head;
      desc.style.cssText = body ? "" : "color:#fff;margin:0";
      delete tip.dataset.show;
      const pos = el.dataset.tipPos === "right" ? "right" : "bottom";
      // 자리는 확대된 화면 좌표로 잡으므로 배율로 나눠 넣음
      const z = pageScale();
      const size = tip.getBoundingClientRect();
      const { left, top } = placeTip(el.getBoundingClientRect(), pos, size.width, size.height, innerWidth, innerHeight);
      tip.style.left = `${left / z}px`;
      tip.style.top = `${top / z}px`;
      tip.dataset.pos = pos;
      requestAnimationFrame(() => { tip.dataset.show = ""; });
    };
    const hide = () => {
      clearTimeout(timer);
      target = null;
      delete tip.dataset.show;
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-tip]");
      if (el === target) return;
      clearTimeout(timer);
      if (!el) {
        hide();
        return;
      }
      // 목록을 훑을 때 깜빡이지 않게 사이드바 · 상단 바 밖에서는 살짝 늦게 띄움
      const instant = el.closest("[data-tip-instant]");
      timer = window.setTimeout(() => show(el), instant ? 0 : 220);
    };
    const focusIn = (e: FocusEvent) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-tip]");
      if (el) show(el);
      else hide();
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("click", hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("click", hide, true);
    };
  }, []);

  // transform 전환이라 Tailwind 의 translate 대신 transform 값을 그대로 씀
  return (
    <div role="tooltip" ref={ref}
      className="pointer-events-none fixed z-60 max-w-67.5 rounded-lg bg-ink px-2.75 py-2 text-[12px] leading-normal text-white opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.18)] wrap-anywhere transform-[translateY(3px)] [transition:opacity_.12s_ease,transform_.12s_ease] break-keep data-show:opacity-100 data-show:transform-none data-[pos=right]:not-data-show:transform-[translateX(-3px)]">
      <b className="block text-[12.5px] font-bold" /><span className="mt-0.75 block text-tip-dim" />
    </div>
  );
}

// 버튼 순서는 확인 창 관례대로 [취소] 왼쪽 · 실행 오른쪽임
export function ConfirmLayer() {
  const [cur, setCur] = useState<{ a: Ask; done: (ok: boolean) => void } | null>(null);
  useEffect(() => {
    registerConfirm((a, done) => setCur({ a, done }));
    return () => registerConfirm(null);
  }, []);
  // 패널 닫기 등 다른 Esc 동작보다 먼저 받아 확인 창만 닫음
  useEscape(cur && (() => {
    cur.done(false);
    setCur(null);
  }), true);
  if (!cur) return null;
  const { a } = cur;
  const close = (ok: boolean) => {
    cur.done(ok);
    setCur(null);
  };
  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-[rgba(17,17,17,.4)] px-4" onClick={() => close(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="ask-title" aria-describedby="ask-message" onClick={(e) => e.stopPropagation()}
        className="w-[min(420px,100%)] rounded-xl bg-surface px-5.5 py-5 shadow-[0_12px_32px_rgba(0,0,0,.18)]">
        <h3 id="ask-title" className={cardTitle}>{a.title}</h3>
        <p id="ask-message" className="mt-2 mb-0 text-[13.5px] whitespace-pre-line text-ink-soft">{a.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={actionButton} autoFocus={a.danger} onClick={() => close(false)}>취소</button>
          <button type="button" className={cn(actionButton, a.danger ? dangerButton : primaryButton)} autoFocus={!a.danger} onClick={() => close(true)}>{a.confirm}</button>
        </div>
      </div>
    </div>
  );
}
