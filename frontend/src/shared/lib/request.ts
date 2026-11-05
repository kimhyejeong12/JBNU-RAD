import type { RequestRow, Role, Stage } from "@/shared/api/types";

export const STAGE_LABEL: Record<Stage, string> = {
  manager: "1차 결재 대기", top: "최종 결재 대기", approved: "승인", rejected: "반려", withdrawn: "철회", revoked: "회수",
};

export const STEP: Partial<Record<Role, Stage>> = { manager: "manager", top: "top" };

export const period = (r: Pick<RequestRow, "period_start" | "period_end">): string =>
  r.period_start || r.period_end ? `${r.period_start || "…"} ~ ${r.period_end || "…"}` : "기간 없음";

export const requester = (r: Pick<RequestRow, "requester_department" | "requester_name">): string =>
  `${r.requester_department} ${r.requester_name}`.trim();

export const today = (): string => new Date().toLocaleDateString("sv-SE");

// 권한 DB 의 active_grants 뷰와 같은 조건입니다.
export const isActive = (r: Pick<RequestRow, "stage" | "period_end">, on: string = today()): boolean =>
  r.stage === "approved" && (!r.period_end || r.period_end >= on);
