import { useEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent } from "react";

// 경과 시간 표시용 — active 일 때 everyMs 마다 지금 시각을 다시 읽습니다 (첫 값은 다음 틱에).
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

// 데이터를 바꾸는 폼(관리 패널 · 노드 등록 · 권한 신청서)은 버튼을 눌러야만 보냅니다 — 입력 칸에서 엔터를 쳐도 폼이 제출되지 않게 막습니다.
// 여러 줄 칸의 줄바꿈과 한글 조합을 끝내는 엔터(isComposing)는 그대로 둡니다.
export function noEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) e.preventDefault();
}
