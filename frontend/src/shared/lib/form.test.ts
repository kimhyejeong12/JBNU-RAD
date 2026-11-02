import { expect, test } from "vitest";
import { eulReul, fieldName, problemText } from "./form";

test("을/를 — 받침이 있으면 을, 없으면 를, 한글이 아니면 을(를)", () => {
  expect(eulReul("이름")).toBe("을");
  expect(eulReul("아이디")).toBe("를");
  expect(eulReul("문서 파일")).toBe("을");
  expect(eulReul("신청 사유")).toBe("를");
  expect(eulReul("ID")).toBe("을(를)");
});

test("칸 이름 — 라벨에서 * · 괄호 설명 · 줄표 앞부분을 뺀다", () => {
  expect(fieldName("노드 이름 *")).toBe("노드 이름");
  expect(fieldName("임시 비밀번호 (첫 로그인에 바꾸게 됩니다)")).toBe("임시 비밀번호");
  expect(fieldName("비밀번호 초기화 — 임시 비밀번호")).toBe("임시 비밀번호");
  expect(fieldName("문서 파일 (.md · .txt, 1MB 까지)")).toBe("문서 파일");
});

test("안내 글자 — 빈 칸은 입력하세요 / 고르세요, 형식이 틀리면 형식과 설명", () => {
  expect(problemText("신청 사유", "missing", false)).toBe("신청 사유를 입력하세요");
  expect(problemText("문서 파일", "missing", true)).toBe("문서 파일을 고르세요");
  expect(problemText("코드", "pattern", false, "영문 · 숫자 · _ . - 만")).toBe("코드 형식을 확인하세요 — 영문 · 숫자 · _ . - 만");
  expect(problemText("이름", "other", false)).toBe("이름을 확인하세요");
});
