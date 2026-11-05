import { useEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent } from "react";

export function useNow(everyMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs, active]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const mq = useMemo(() => matchMedia(query), [query]);
  return useSyncExternalStore(
    (cb) => {
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => mq.matches,
  );
}

export function activateProps(fn: () => void) {
  return {
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  };
}

// 엔터로 폼이 제출되지 않게 막되, 여러 줄 칸 · 한글 조합(isComposing)의 엔터는 둡니다.
export function noEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) e.preventDefault();
}
