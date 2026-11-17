import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

// Esc 키 — first 면 다른 Esc 동작(패널 닫기)보다 먼저 받아 멈춤, on 이 null 이면 안 받음
export function useEscape(on: (() => void) | null, first = false) {
  const latest = useRef(on);
  useEffect(() => {
    latest.current = on;
  });
  const active = !!on;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || !latest.current) return;
      if (first) e.stopPropagation();
      latest.current();
    };
    document.addEventListener("keydown", onKey, first);
    return () => document.removeEventListener("keydown", onKey, first);
  }, [active, first]);
}

// 줄을 size 개씩 쪽으로 나눕니다 — 거르기로 줄이 줄어 지금 쪽이 없어지면 마지막 쪽을 보입니다.
export function usePage<T>(rows: T[], size: number) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages);
  return { shown: rows.slice((at - 1) * size, at * size), at, pages, setPage };
}

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
