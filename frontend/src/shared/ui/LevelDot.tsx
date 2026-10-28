import type { Level } from "@/shared/api/types";

// 등급 점 — 8px 점 + 같은 색 반투명 링. 등급이 없으면 회색.
export function LevelDot({ level }: { level?: Level | null }) {
  return <i className={`ldot ${level ?? "none"}`} />;
}
