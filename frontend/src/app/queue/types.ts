import type { AccessItem, Decision, EventFinding, Level, PolicyIssue, RequestRow, ServerFinding, UserRow } from "@/shared/api/types";

// 큐 항목 — 메뉴마다 다른 데이터를 한 목록 형식으로. raw 는 종류별 원본 행입니다.
interface Base {
  key: string;
  itemKey?: string;      // 운영자 결정의 item_key (정책 · 서버 · 로그)
  id: string;
  typeLabel?: string;    // 분류 칸에 TYPE_LABEL 대신 쓸 글자
  level?: Level;
  decision?: Decision;
  who: string;
  what: string;
  when: string;
  judge: string;
  sub?: string;
}

export type QueueItem =
  | (Base & { type: "req" | "mine"; raw: RequestRow })
  | (Base & { type: "user"; raw: UserRow })
  | (Base & { type: "access"; raw: AccessItem })
  | (Base & { type: "policy"; raw: PolicyIssue })
  | (Base & { type: "server"; raw: ServerFinding })
  | (Base & { type: "event"; raw: EventFinding });
