import { RESULT_VIEWS, VIEWS, type View } from "@/app/views";
import type { StageFilter } from "@/app/ui/uiReducer";
import { runKindLabel } from "@/shared/api/jobs";
import type { Jobs } from "@/shared/api/types";

// 빈 목록 문구 — 한 줄로 다음 할 일을 알려 줍니다.
export function emptyText(view: View, stageFilter: StageFilter, jobs: Jobs | null, anyInView: boolean): string {
  if (anyInView) return "조건에 맞는 항목이 없습니다.";
  if (view === "events") return "검토할 주의 · 위험 판정이 없습니다.";
  if (RESULT_VIEWS.has(view)) return `아직 ${VIEWS[view].label} 결과가 없습니다. 오른쪽 위 [${runKindLabel(jobs, view)}]을 누르세요.`;
  const byView: Partial<Record<View, string>> = {
    requests: { pending: "지금 결재할 신청이 없습니다.", active: "지금 유효한 권한이 없습니다.", all: "신청이 없습니다." }[stageFilter],
    mine: "아직 신청한 권한이 없습니다. 위 신청서를 채워 신청하세요.",
    users: "계정이 없습니다.",
    access: "등록한 권한이 없습니다. [권한 등록]으로 넣으세요.",
  };
  return byView[view] ?? "";
}
