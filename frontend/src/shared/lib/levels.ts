import type { Level } from "@/shared/api/types";

export const LEVELS: readonly Level[] = ["정상", "주의", "위험"];
export const LEVEL_ICON: Record<Level, string> = { "정상": "ok", "주의": "warn", "위험": "bad" };

// 화면에는 등급 단어만 쓰고, 등급에서 나오는 권고 문구와 기준은 툴팁에만 둡니다.
export const LEVEL_TIP: Record<Level, string> = {
  "정상": "승인 권고|기준 문서에 부합 — AI가 승인을 권고합니다",
  "주의": "추가 검토|직무 연관성은 있으나 범위가 필요 이상 — 결재자 추가 검토 (기준 4.3)",
  "위험": "반려 권고|직무 무관 · 필수 승인 누락 · 장기 미사용 관리자 권한 (기준 4.2)",
};
