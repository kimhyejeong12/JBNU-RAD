import { expect, test } from "vitest";
import type { AccessItem } from "@/shared/api/types";
import { accessItem } from "./lib";

const access = (p: Partial<AccessItem>): AccessItem =>
  ({ id: 1, code: "HR_READ", name: "인사정보 조회", system: "인사 시스템", category: "인사정보", description: "읽기", is_active: true, created_by: 1,
    updated_at: "2026-10-20T09:00:00+09:00", created_at: "2026-10-20T09:00:00+09:00", ...p });

test("accessItem: 신청 가능 · 막힘, 분류 아래 설명, 시스템 배지", () => {
  expect(accessItem(access({}))).toMatchObject({ type: "access", key: "access:HR_READ", id: "HR_READ", kind: "인사 시스템", who: "인사정보 조회", what: "인사정보", note: "읽기", when: "2026-10-20 09:00", judge: "신청 가능" });
  expect(accessItem(access({ is_active: false, system: "", category: "", description: "" }))).toMatchObject({ kind: undefined, what: "—", note: undefined, judge: "신청 막힘" });
});
