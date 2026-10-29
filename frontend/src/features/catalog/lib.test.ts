import { expect, test } from "vitest";
import type { AccessItem } from "@/shared/api/types";
import { accessItem } from "./lib";

const access = (p: Partial<AccessItem>): AccessItem =>
  ({ code: "HR_READ", name: "인사정보 조회", system: "인사 시스템", category: "인사정보", description: "읽기", is_active: true, updated_at: "2026-10-20T09:00:00+09:00", created_at: null, ...p });

test("accessItem: 켜짐 · 꺼짐, 분류 — 설명", () => {
  expect(accessItem(access({}))).toMatchObject({ type: "access", key: "access:HR_READ", id: "", typeLabel: "인사 시스템", who: "인사정보 조회 (HR_READ)", what: "인사정보 — 읽기", when: "2026-10-20 09:00", judge: "켜짐" });
  expect(accessItem(access({ is_active: false, system: null, category: null, description: null }))).toMatchObject({ typeLabel: "—", what: "—", judge: "꺼짐" });
});
