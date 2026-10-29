import { useEffect, useRef } from "react";
import { placeTip } from "@/shared/lib/tooltip";

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
      tip.classList.remove("show");
      const pos = el.dataset.tipPos === "right" ? "right" : "bottom";
      const { left, top } = placeTip(el.getBoundingClientRect(), pos, tip.offsetWidth, tip.offsetHeight, innerWidth, innerHeight);
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      tip.dataset.pos = pos;
      requestAnimationFrame(() => tip.classList.add("show"));
    };
    const hide = () => {
      clearTimeout(timer);
      target = null;
      tip.classList.remove("show");
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
      const instant = el.closest(".sidebar, .topbar");
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

  return <div className="tip" role="tooltip" ref={ref}><b /><span /></div>;
}
