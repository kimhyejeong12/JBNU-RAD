// API 응답 모양은 손으로 안 적음 — responses.py 에서 만든 schema.ts 를 다시 내보냄
// 여기에는 화면만 쓰는 타입(거르기 값 · 화면 상태)과, 도구마다 모양이 달라 명세가 열어 둔 칸을 좁힌 것만 둠
import type * as S from "./schema";

export type {
  AccessItem, AuditRow, Briefing, Conversation, Decision, DecisionResult, EventFinding, ExtractedPdf, ExtractedTables, GrantReview, Health,
  Jobs, LogFacts, Me, NodeDetail, NodeRow, NodeWithKey, Overview, OverviewRow, PolicyIssue, PolicyPass, Regulation, RegulationIndex, RequestRow, Results, RiskFlag, RiskPeople,
  RiskPerson, SafetyDay, SafetyScore, Section, ServerFinding, Snapshot, SnapshotState, StatNode, Stats, Suspect, Todo, UserRow, UserStats, Verdict, WatchFlag,
  WatchPerson, XlsxTable,
} from "./schema";

export type Role = S.Me["role"];
export type Level = S.NodeGrade["level"];
export type Stage = S.RequestRow["stage"];
export type SuspectLevel = NonNullable<S.Suspect["level"]>;
export type OverviewArea = S.OverviewRow["area"];

// 서버의 responses.AuditTarget 과 같게 둠 (요청 칸이라 명세에 타입으로 안 나옴)
export type AuditTarget = "regulation" | "user" | "access";
export type JobKind = "policies" | "nodes" | "suspects" | "briefing";
export type LogPeriod = "day" | "week" | "month" | "all";
export type StatPeriod = "week" | "month" | "quarter" | "all";

// 화면이 고르는 기간은 넷뿐이라 그 넷으로 좁힘 (서버는 더 긴 기간도 받음)
export type LogsPage = Omit<S.LogsPage, "period"> & { period: LogPeriod };

export interface LogsParams {
  period: LogPeriod;
  user: string;
  solution: string;
  how: string;
  page: number;
}

// 질의의 servers 도구가 내는 집계 — 도구마다 모양이 달라 명세에는 열린 객체로만 나옴
export interface ServerFacts {
  "노드 수": number;
  "마지막 판정 등급별 노드 수"?: Record<string, number>;
  "기간 안 첫 수집"?: string | null;
  "기간 안 마지막 수집"?: string | null;
  "노드별"?: Record<string, { "수집": number; "바뀐 설정": number; "판정": Record<string, number> }>;
}

// 질의 에이전트가 부른 도구 한 번 — facts 는 find_logs 면 로그 집계, servers 면 서버 집계임
export type AskStep = Omit<S.AskStep, "facts"> & { facts?: S.LogFacts | ServerFacts | null };
export type AskAnswer = Omit<S.AskAnswer, "steps"> & { steps: AskStep[] };
export type QaRecord = Omit<S.QaRecord, "steps"> & { steps: AskStep[] };

// 화면의 질의 한 턴 — 방금 받은 답(AskAnswer)과 지난 기록(QaRecord)이 함께 가진 칸만 씀
// started 가 있으면 답을 기다리는 중이고, id 는 서버의 기록 번호가 아니라 화면이 붙인 것임
type AskTurn = Pick<QaRecord, "answer" | "steps" | "sources" | "checks" | "failed" | "error" | "elapsed_sec" | "conversation_id">;
export type AskItem = Partial<AskTurn> & { id: string; q: string; started: number | null; restarts?: number };
