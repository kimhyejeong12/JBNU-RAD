import { useEffect, useState } from "react";
import { registerConfirm, type Ask } from "./ask";
import { cn } from "@/shared/lib/cn";
import { actionButton, dangerButton, primaryButton } from "@/shared/ui/base/styles";

// 버튼 순서는 확인 창 관례대로 [취소] 왼쪽 · 실행 오른쪽입니다.
export function ConfirmLayer() {
  const [cur, setCur] = useState<{ a: Ask; done: (ok: boolean) => void } | null>(null);
  useEffect(() => {
    registerConfirm((a, done) => setCur({ a, done }));
    return () => registerConfirm(null);
  }, []);
  useEffect(() => {
    if (!cur) return;
    // 패널 닫기 등 다른 Esc 동작보다 먼저 받아 확인 창만 닫습니다.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cur.done(false);
      setCur(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [cur]);
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
        <h3 id="ask-title" className="m-0 text-[15.5px] font-bold">{a.title}</h3>
        <p id="ask-message" className="mt-2 mb-0 text-[13.5px] whitespace-pre-line text-ink-soft">{a.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={actionButton} autoFocus={a.danger} onClick={() => close(false)}>취소</button>
          <button type="button" className={cn(actionButton, a.danger ? dangerButton : primaryButton)} autoFocus={!a.danger} onClick={() => close(true)}>{a.confirm}</button>
        </div>
      </div>
    </div>
  );
}
