import type { AskKind } from "@/shared/api/types";

interface AskConfig {
  label: string;
  url: string;
  placeholder: string;
  empty: string;
  examples: string[];
}

// 질의 탭은 메뉴의 기능을 따릅니다. 예시 질문도 여기 한 곳에서 정하고, 누르면 직접 입력과 똑같이 답을 만듭니다.
export const ASK: Record<AskKind, AskConfig> = {
  policy: {
    label: "정책 질의", url: "/api/ask", placeholder: "정책 · 접근 권한에 대해 질문하세요",
    empty: "사내 기준 문서와 솔루션 정책을 근거로 답합니다.",
    examples: [
      "인사팀 김민수가 급여 테이블(HR_SALARY)에 접근할 수 있어?",
      "마케팅팀이 사내포털에 HTTPS로 접근하는 정책은 몇 개야?",
      "개발팀 사원이 운영 DB 관리자 권한을 받아도 돼?",
    ],
  },
  servers: {
    label: "서버 질의", url: "/api/ask-servers", placeholder: "서버 상태 · 바뀐 설정을 물어보세요",
    empty: "수집 노드의 기록과 서버 점검 결과로 답합니다.",
    examples: [
      "지금 방화벽에 문제가 있는 서버는?",
      "어제부터 설정이 바뀐 서버가 있어?",
      "SSH 루트 로그인이 열려 있는 서버는?",
    ],
  },
  logs: {
    label: "로그 질의", url: "/api/ask-logs", placeholder: "보안 솔루션 로그에 대해 질문하세요",
    empty: "보안 솔루션 로그를 찾아 세어서 답합니다.",
    examples: [
      "홍길동이 출력을 몇 번 했어?",
      "10월 6일 VDI에서 출력된 페이지는 모두 몇 장이야?",
      "예외 처리된 출력이 있었어?",
    ],
  },
};
