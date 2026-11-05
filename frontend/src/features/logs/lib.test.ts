import { expect, test } from "vitest";
import { filterChoices, logAttrs, pageCount } from "./lib";

test("logAttrs: 항목을 '키=값 · 키=값' 으로", () => {
  expect(logAttrs({ attributes: { Attachments: "a.pdf", PrintCount: 3 } })).toBe("Attachments=a.pdf · PrintCount=3");
  expect(logAttrs({})).toBe("");
});

test("pageCount: 최소 1쪽", () => {
  expect(pageCount({ total: 0, page_size: 100 })).toBe(1);
  expect(pageCount({ total: 101, page_size: 100 })).toBe(2);
});

test("filterChoices: 거르기 버튼 — 값마다 건수(그 칸을 거르지 않을 때만), 고른 값이 목록에 없어도 남긴다", () => {
  const counts = { "재무 정다은": 48, "개발 박민수": 25 };
  expect(filterChoices(["개발 박민수", "재무 정다은"], "", counts)).toEqual([
    { value: "개발 박민수", count: 25 }, { value: "재무 정다은", count: 48 },
  ]);
  expect(filterChoices(["개발 박민수", "재무 정다은"], "재무 정다은", { "재무 정다은": 48 })).toEqual([
    { value: "개발 박민수" }, { value: "재무 정다은" },
  ]);
  expect(filterChoices(["개발 박민수"], "외주개발 이준호", undefined)).toEqual([{ value: "외주개발 이준호" }, { value: "개발 박민수" }]);
});
