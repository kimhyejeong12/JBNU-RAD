import type { AccessItem, Decision, EventFinding, Level, PolicyIssue, Regulation, RequestRow, ServerFinding, UserRow } from "@/shared/api/types";

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
  lead?: string;         // 주요 문제 칸 앞 굵은 글 (정책 유형 · 다른 곳 수)
  note?: string;         // 그 칸 아래 작은 줄 (로그 감시의 AI 이유 첫 요점)
  sub?: string;
}

export type QueueItem =
  | (Base & { type: "req"; raw: RequestRow })
  | (Base & { type: "user"; raw: UserRow })
  | (Base & { type: "access"; raw: AccessItem })
  | (Base & { type: "doc"; raw: Regulation })
  | (Base & { type: "policy"; raw: PolicyIssue })
  | (Base & { type: "server"; raw: ServerFinding })
  | (Base & { type: "event"; raw: EventFinding });
