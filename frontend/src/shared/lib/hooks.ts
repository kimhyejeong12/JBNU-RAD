import { useEffect, useMemo, useReducer, useSyncExternalStore, type KeyboardEvent } from "react";

// 경과 시간 표시용 — active 일 때 everyMs 마다 다시 그려 지금 시각을 읽습니다.
export function useNow(everyMs: number, active: boolean): number {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(tick, everyMs);
    return () => clearInterval(t);
  }, [everyMs, active]);
  return Date.now();
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

// 목록의 행처럼 버튼이 아닌 요소를 키보드(Enter · Space)로도 고르게 합니다.
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
