import type { StatKind } from "@/app/ui/uiReducer";
import type { Level, StatPeriod, SuspectLevel } from "@/shared/api/types";

export const STAT_PERIODS: [StatPeriod, string][] = [["week", "일주일"], ["month", "한 달"], ["quarter", "3개월"], ["all", "전체"]];
export const STAT_TITLES: Record<StatKind, string> = { stats: "보안 통계", ustats: "사용자 위협" };

// 의심 등급 → 막대 색 (등급 색을 빌려 씁니다 — 높음 = 위험 색)
export const SUSPECT_COLOR: Record<SuspectLevel, Level> = { "높음": "위험", "보통": "주의", "낮음": "정상" };
