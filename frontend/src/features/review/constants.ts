export const DECISIONS: Record<string, string> = { approve: "승인", cond: "조건부 승인", reject: "반려 확정", clear: "이상 없음", act: "조치 필요" };

// 로그 감시 · 서버 점검은 승인할 대상이 아니라 확인할 대상이라 결정 버튼이 다릅니다. 값은 버튼 색(CSS 클래스)입니다.
export const DECISION_SET: Record<string, Record<string, string>> = {
  policy: { approve: "approve", cond: "cond", reject: "reject" },
  event: { clear: "approve", act: "reject" },
  server: { clear: "approve", act: "reject" },
};
