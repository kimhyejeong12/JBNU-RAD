import { expect, test } from "vitest";
import { changeSummary, changeText } from "./labels";

const row = (detail: Record<string, unknown>) => ({ id: 1, at: "", action: "user_update", by: "", detail });

test("changeText: 사유가 먼저, 없으면 바뀐 칸과 값", () => {
  expect(changeText(row({ reason: "조항 번호 오타", chars: 120 }))).toBe("조항 번호 오타");
  expect(changeText(row({ department: "재무팀", role: "manager", is_active: 0, left_on: "" }))).toBe("부서 재무팀, 역할 보안 운영자, 상태 비활성, 퇴사일 빈 값");
  expect(changeText(row({ chars: 300 }))).toBe("");
  expect(changeText(row({ department: "인사팀", is_active: false, from: { department: "", is_active: 1 } }))).toBe("부서 빈 값 → 인사팀, 상태 활성 → 비활성");
});

test("changeSummary: 바뀐 칸 이름, 모르면 동작 이름", () => {
  expect(changeSummary(row({ department: "인사팀", job: "급여", from: { department: "", job: "" } }))).toBe("부서, 직무");
  expect(changeSummary(row({ department: "인사팀", job: "급여" }))).toBe("수정");
  expect(changeSummary({ ...row({}), action: "password_reset" })).toBe("비밀번호 초기화");
  expect(changeSummary({ ...row({ reason: "조항 번호 오타", chars: 120 }), action: "regulation_edit" })).toBe("수정, 조항 번호 오타");
});
