import type { LogPeriod } from "@/shared/api/types";

export const PERIOD_LABEL: Record<LogPeriod, string> = { day: "하루", week: "일주일", month: "한 달", quarter: "3개월", half: "6개월", year: "1년", all: "전체" };

// [조건 이름, 칸 id, 전체 옵션 글자, 응답 options 의 키]
export const LOG_FILTERS: [key: "user" | "solution" | "how", id: string, all: string, opt: "users" | "solutions" | "how"][] = [
  ["user", "log-user", "전체 사용자", "users"],
  ["solution", "log-solution", "전체 솔루션", "solutions"],
  ["how", "log-how", "전체 행위", "how"],
];
