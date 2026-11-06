import { expect, test } from "vitest";
import { docItem, editProblem, removeProblem, uploadProblem } from "./lib";

const doc = {
  name: "접근권한_관리기준.md",
  content: "# 접근 권한 관리 기준\n\n## 3. 접근 통제 원칙\n\n### 3.1 권한 부여 원칙\n내용\n\n### 3.2 인사 정보 접근\n내용\n\n## 4. 권한 검토\n\n### 4.1 정기 검토\n내용\n",
  updated_at: "2026-10-29T02:57:00+00:00",
};

test("기준 문서 한 줄 — 제목은 첫 # 줄, 파일 이름, 고친 시각, 번호가 붙은 조항 수", () => {
  expect(docItem(doc)).toMatchObject({
    type: "doc", key: "doc:접근권한_관리기준.md",
    who: "접근 권한 관리 기준", what: "접근권한_관리기준.md", when: "2026-10-29 11:57", judge: "3개",
  });
});

test("제목 줄이 없으면 파일 이름, 조항이 없으면 없음", () => {
  expect(docItem({ name: "메모.txt", content: "그냥 글" })).toMatchObject({ who: "메모.txt", judge: "없음", when: "" });
});

test("올릴 파일 확인 — .md · .txt 만, 1MB 까지, 같은 이름은 안 됨", () => {
  expect(uploadProblem({ name: "개인정보_처리기준.md", size: 2048 }, ["접근권한_관리기준.md"])).toBeNull();
  expect(uploadProblem({ name: "메모.TXT", size: 10 }, [])).toBeNull();
  expect(uploadProblem({ name: "절차서.pdf", size: 10 }, [])).toBe(".md, .txt 파일만 올릴 수 있습니다");
  expect(uploadProblem({ name: "큰문서.md", size: 1_000_001 }, [])).toBe("1MB 까지 올릴 수 있습니다");
  expect(uploadProblem({ name: "접근권한_관리기준.md", size: 10 }, ["접근권한_관리기준.md"])).toBe("같은 이름의 기준 문서가 있습니다. 다른 이름으로 올리세요");
});

test("고치기 확인 — 바뀐 내용 · 사유 · 파일 이름을 똑같이 입력해야 고칠 수 있다", () => {
  const ok = { content: doc.content + "\n### 4.2 수시 검토\n내용\n", reason: "수시 검토 조항 추가", typed: "접근권한_관리기준.md" };
  expect(editProblem(doc, ok)).toBeNull();
  expect(editProblem(doc, { ...ok, content: doc.content })).toBe("바뀐 내용이 없습니다");
  expect(editProblem(doc, { ...ok, content: "  \n" })).toBe("빈 문서로 고칠 수 없습니다");
  expect(editProblem(doc, { ...ok, reason: " " })).toBe("고치는 사유를 적으세요");
  expect(editProblem(doc, { ...ok, typed: "접근권한" })).toBe("확인 칸에 파일 이름을 똑같이 입력하세요");
});

test("지우기 확인 — 마지막 문서는 안 되고, 사유 · 파일 이름을 똑같이 입력해야 지울 수 있다", () => {
  const ok = { reason: "새 기준으로 바뀜", typed: "접근권한_관리기준.md" };
  expect(removeProblem(doc, 2, ok)).toBeNull();
  expect(removeProblem(doc, 1, ok)).toBe("마지막 기준 문서는 지울 수 없습니다. 새 문서를 먼저 올리세요");
  expect(removeProblem(doc, 2, { ...ok, reason: " " })).toBe("지우는 사유를 적으세요");
  expect(removeProblem(doc, 2, { ...ok, typed: "접근권한" })).toBe("확인 칸에 파일 이름을 똑같이 입력하세요");
});
