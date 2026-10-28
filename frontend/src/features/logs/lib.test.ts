import { expect, test } from "vitest";
import { logAttrs, pageCount } from "./lib";

test("logAttrs: 항목을 '키=값 · 키=값' 으로", () => {
  expect(logAttrs({ attributes: { Attachments: "a.pdf", PrintCount: 3 } })).toBe("Attachments=a.pdf · PrintCount=3");
  expect(logAttrs({})).toBe("");
});

test("pageCount: 최소 1쪽", () => {
  expect(pageCount({ total: 0, page_size: 100 })).toBe(1);
  expect(pageCount({ total: 101, page_size: 100 })).toBe(2);
});
