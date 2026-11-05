import type { LogPeriod } from "@/shared/api/types";

// 자주 쓰는 넷만 둡니다 (서버는 3개월 · 6개월 · 1년도 받습니다).
export const PERIOD_LABEL: Record<LogPeriod, string> = { day: "하루", week: "일주일", month: "한 달", all: "전체" };

// [조건 이름, 칸 id, 이름, options 의 키, facts 의 키]
export const LOG_FILTERS: [key: "solution" | "how", id: string, label: string, opt: "solutions" | "how", fact: "by_solution" | "by_how"][] = [
  ["solution", "log-solution", "솔루션", "solutions", "by_solution"],
  ["how", "log-how", "행위", "how", "by_how"],
];

export interface FilterChoice { value: string; count?: number }

// 그 칸을 거르는 중이면 다른 값이 0 으로 나와 건수를 붙이지 않습니다.
export function filterChoices(values: string[], selected: string, counts: Record<string, number> | undefined): FilterChoice[] {
  const all = selected && !values.includes(selected) ? [selected, ...values] : values;
  return all.map((value) => (!selected && counts && value in counts ? { value, count: counts[value] } : { value }));
}

export const logAttrs = (e: { attributes?: Record<string, string | number> | null }): string =>
  Object.entries(e.attributes || {}).map(([k, v]) => `${k}=${v}`).join(" · ");

export const pageCount = (d: { total: number; page_size: number }): number => Math.max(1, Math.ceil(d.total / d.page_size));
