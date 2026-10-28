import { expect, test } from "vitest";
import type { AccessItem, RequestRow } from "@/shared/api/types";
import { accessOptions } from "./accessOptions";

const access = (code: string, system: string | null, extra: Partial<AccessItem> = {}): AccessItem =>
  ({ code, name: `권한 ${code}`, system, category: null, description: null, is_active: true, updated_at: null, ...extra });
const mine = (access_code: string, stage: RequestRow["stage"], period_end: string | null = null): RequestRow =>
  ({ access_code, stage, period_end } as RequestRow);

const catalog = [access("A-1", "A"), access("A-2", "A"), access("B-1", "B"), access("OFF", "B", { is_active: false }), access("X-1", null)];
const held = [mine("A-1", "approved"), mine("A-2", "manager"), mine("OLD", "approved", "2000-01-01")];

test("시스템별로 묶고 꺼진 권한은 빼며, 시스템이 없으면 기타", () => {
  const o = accessOptions(catalog, held, "");
  expect(o.groups.map(([sys, items]) => [sys, items.map((a) => a.code)])).toEqual([["A", ["A-1", "A-2"]], ["B", ["B-1"]], ["기타", ["X-1"]]]);
  expect(o.empty).toBe(false);
});

test("보유 중 · 결재 중인 권한은 막고 이유를 적는다", () => {
  expect(accessOptions(catalog, held, "").reason).toEqual({ "A-1": "보유 중", "A-2": "결재 중" });
});

test("앞 선택은 막히지 않았을 때만 유지한다", () => {
  expect(accessOptions(catalog, held, "B-1").value).toBe("B-1");
  expect(accessOptions(catalog, held, "A-1").value).toBe("");
  expect(accessOptions(catalog, held, "").value).toBe("");
});

test("켜진 권한이 없으면 비었다고 알린다", () => {
  const o = accessOptions([access("OFF", "B", { is_active: false })], [], "");
  expect(o.empty).toBe(true);
  expect(o.groups).toEqual([]);
});
