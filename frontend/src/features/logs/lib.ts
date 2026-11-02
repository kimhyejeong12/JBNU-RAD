import type { LogPeriod } from "@/shared/api/types";

export const PERIOD_LABEL: Record<LogPeriod, string> = { day: "하루", week: "일주일", month: "한 달", quarter: "3개월", half: "6개월", year: "1년", all: "전체" };

// [조건 이름, 칸 id, 이름, 응답 options 의 키, 집계(facts)의 키]
export const LOG_FILTERS: [key: "user" | "solution" | "how", id: string, label: string, opt: "users" | "solutions" | "how", fact: "by_user" | "by_solution" | "by_how"][] = [
  ["user", "log-user", "사용자", "users", "by_user"],
  ["solution", "log-solution", "솔루션", "solutions", "by_solution"],
  ["how", "log-how", "행위", "how", "by_how"],
];
// 값이 이보다 많으면 버튼 대신 입력하면 후보가 뜨는 칸 (사용자가 많은 조직).
export const MAX_FILTER_BUTTONS = 12;

export interface FilterChoice { value: string; count?: number }

// 거르기 버튼 — 값마다 기간 안 건수를 붙입니다. 그 칸을 거르는 중이면 집계가 걸러진 결과라(다른 값이 0) 건수를 붙이지 않습니다.
// 고른 값이 이 기간 로그에 없더라도(판정에서 넘어온 사용자 등) 버튼에서 사라지지 않게 앞에 둡니다.
export function filterChoices(values: string[], selected: string, counts: Record<string, number> | undefined): FilterChoice[] {
  const all = selected && !values.includes(selected) ? [selected, ...values] : values;
  return all.map((value) => (!selected && counts && value in counts ? { value, count: counts[value] } : { value }));
}

// 로그 줄의 항목(Attachments=… · PrintCount=…) 한 줄.
export const logAttrs = (e: { attributes?: Record<string, string | number> | null }): string =>
  Object.entries(e.attributes || {}).map(([k, v]) => `${k}=${v}`).join(" · ");

export const pageCount = (d: { total: number; page_size: number }): number => Math.max(1, Math.ceil(d.total / d.page_size));
