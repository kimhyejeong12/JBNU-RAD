import { useState } from "react";
import { defaultNavWide } from "@/app/session/views";

const KEY = "sentinelai.nav-wide";

// 사이드바 펼침 — 접거나 펼친 적이 있으면 이 브라우저에 남긴 선택, 없으면 화면 폭으로 정합니다.
export function useNavWide(): [wide: boolean, toggle: () => void] {
  const [wide, setWide] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved !== null) return saved === "1";
    } catch {
      // 저장소를 못 쓰면 화면 폭으로 정합니다.
    }
    return defaultNavWide(window.innerWidth);
  });
  const toggle = () => {
    const next = !wide;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // 저장하지 못해도 이번 화면에서는 바뀝니다.
    }
    setWide(next);
  };
  return [wide, toggle];
}
