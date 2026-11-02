import { useEffect, useRef } from "react";
import { placeTip } from "@/shared/lib/tooltip";
import { pageScale } from "@/app/layout/pageScale";

// 툴팁 — data-tip="제목|설명". 다시 그려져도 동작하도록 document 에 위임하고, 내용은 textContent 로만 넣습니다.
// 마지막 자식으로 두어 opacity · transform 이 걸린 조상 밑에 들어가지 않게 합니다.
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
      // 자리는 화면 좌표(확대된 크기)로 잡고, 확대된 화면 안에 놓으므로 배율로 나눠 넣습니다.
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
      // 사이드바 · 상단 바는 바로, 나머지는 목록을 훑을 때 깜빡이지 않게 살짝 늦게
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

  // 보일 때 data-show, 오른쪽에 뜨면 data-pos="right". 숨은 동안은 3px 비켜 있다가 보이면서 제자리로 옵니다.
  // 움직임은 transform 전환이라 Tailwind 의 translate(별도 속성) 대신 transform 값을 그대로 쓰고, 세 상태가 서로 겹치지 않게 둡니다.
  return (
    <div role="tooltip" ref={ref}
      className="pointer-events-none fixed z-60 max-w-67.5 rounded-lg bg-ink px-2.75 py-2 text-[12px] leading-normal text-white opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.18)] wrap-anywhere transform-[translateY(3px)] [transition:opacity_.12s_ease,transform_.12s_ease] break-keep data-show:opacity-100 data-show:transform-none data-[pos=right]:not-data-show:transform-[translateX(-3px)]">
      <b className="block text-[12.5px] font-bold" /><span className="mt-0.75 block text-tip-dim" />
    </div>
  );
}
