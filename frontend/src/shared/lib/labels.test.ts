import { expect, test } from "vitest";
import { changeText } from "./labels";

const row = (detail: Record<string, unknown>) => ({ id: 1, at: "", action: "user_update", by: "", detail });

test("changeText: 사유가 먼저, 없으면 바뀐 칸과 값", () => {
  expect(changeText(row({ reason: "조항 번호 오타", chars: 120 }))).toBe("조항 번호 오타");
  expect(changeText(row({ department: "재무팀", role: "manager", is_active: 0, left_on: "" }))).toBe("부서 재무팀, 역할 보안 운영자, 상태 끔, 퇴사일 비움");
  expect(changeText(row({ chars: 300 }))).toBe("");
});
