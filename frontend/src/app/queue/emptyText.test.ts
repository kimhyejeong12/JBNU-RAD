import { expect, test } from "vitest";
import type { Jobs } from "@/shared/api/types";
import { emptyText } from "./emptyText";

const jobs = { running: null, kinds: { policies: "정책 관리 검토" } } as Jobs;

test("조건에 걸러진 것이면 그 문구", () => {
  expect(emptyText("requests", "pending", jobs, true)).toBe("조건에 맞는 항목이 없습니다.");
});

test("정책 관리 · 로그 감시", () => {
  expect(emptyText("events", "pending", jobs, false)).toBe("검토할 주의 · 위험 판정이 없습니다.");
  expect(emptyText("policies", "pending", jobs, false)).toBe("아직 정책 관리 결과가 없습니다. 오른쪽 위 [정책 관리 검토 실행]을 누르세요.");
  expect(emptyText("policies", "pending", null, false)).toBe("아직 정책 관리 결과가 없습니다. 오른쪽 위 [분석 실행]을 누르세요.");
});

test("권한 신청은 결재 단계 거르기마다", () => {
  expect(emptyText("requests", "pending", jobs, false)).toBe("지금 결재할 신청이 없습니다.");
  expect(emptyText("requests", "active", jobs, false)).toBe("지금 유효한 권한이 없습니다.");
  expect(emptyText("requests", "all", jobs, false)).toBe("신청이 없습니다.");
});

test("내 신청 · 계정 · 권한 목록", () => {
  expect(emptyText("mine", "pending", jobs, false)).toBe("아직 신청한 권한이 없습니다. 위 신청서를 채워 신청하세요.");
  expect(emptyText("users", "pending", jobs, false)).toBe("계정이 없습니다.");
  expect(emptyText("access", "pending", jobs, false)).toBe("등록한 권한이 없습니다. [권한 등록]으로 넣으세요.");
});
