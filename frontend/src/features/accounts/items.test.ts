import { expect, test } from "vitest";
import type { AccessItem, UserRow } from "@/shared/api/types";
import { accessItem } from "@/features/catalog/items";
import { userItem } from "./items";

const user = (p: Partial<UserRow>): UserRow => ({
  id: 7, login_id: "dev-op", display_name: "보안 운영자", department: "보안팀", role: "manager", is_root: false, is_active: true,
  must_change_password: false, locked_until: null, last_login_at: "2026-10-29T05:00:00+09:00", log_id: null, created_at: "2026-10-01T00:00:00+09:00", ...p,
});

test("userItem: 정지 · 잠김 · 활성, 비밀번호 변경 전, 루트 표시", () => {
  expect(userItem(user({}))).toMatchObject({ type: "user", key: "user:7", id: "dev-op", typeLabel: "보안 운영자", who: "보안 운영자 (dev-op)", what: "보안팀", when: "2026-10-29 05:00", judge: "활성", sub: "" });
  expect(userItem(user({ is_active: false })).judge).toBe("정지");
  expect(userItem(user({ locked_until: "2999-01-01T00:00:00+09:00" })).judge).toBe("잠김");
  expect(userItem(user({ locked_until: "2000-01-01T00:00:00+09:00" })).judge).toBe("활성");
  expect(userItem(user({ must_change_password: true })).sub).toBe("비밀번호 변경 전");
  expect(userItem(user({ role: "top", is_root: true })).typeLabel).toBe("보안 총책임자 · 루트");
  expect(userItem(user({ department: null, last_login_at: null })) ).toMatchObject({ what: "부서 없음", when: "—" });
});

const access = (p: Partial<AccessItem>): AccessItem =>
  ({ code: "HR_READ", name: "인사정보 조회", system: "인사 시스템", category: "인사정보", description: "읽기", is_active: true, updated_at: "2026-10-20T09:00:00+09:00", created_at: null, ...p });

test("accessItem: 켜짐 · 꺼짐, 분류 — 설명", () => {
  expect(accessItem(access({}))).toMatchObject({ type: "access", key: "access:HR_READ", id: "", typeLabel: "인사 시스템", who: "인사정보 조회 (HR_READ)", what: "인사정보 — 읽기", when: "2026-10-20 09:00", judge: "켜짐" });
  expect(accessItem(access({ is_active: false, system: null, category: null, description: null }))).toMatchObject({ typeLabel: "—", what: "—", judge: "꺼짐" });
});
