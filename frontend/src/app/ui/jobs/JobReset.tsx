import { useMe } from "@/app/session/me";
import { useJobs } from "@/app/session/data";
import { ask } from "@/app/ui/confirm/ask";
import { busyJob, useResetJobs } from "@/shared/api/jobs";
import { cn } from "@/shared/lib/cn";
import { toolButton } from "@/shared/ui/base/styles";

// 모델 서버가 응답하지 않으면 다른 작업이 모두 막혀서 강제 중지를 둡니다.
export function JobReset() {
  const me = useMe();
  const jobs = useJobs();
  const reset = useResetJobs();
  const name = busyJob(jobs);
  if (me.role !== "top" || !name) return null;

  async function onClick() {
    const message = `${name}을(를) 강제로 끝내고 바로 다시 돌립니다.\n\n`
      + "· 지금 판정 중인 한 건은 끝날 때까지 이어집니다.\n"
      + "· 서버 점검 · 위협 예측은 끝낸 사람 · 노드만 남고, 정책 관리 검토 · 로그 감시는 처음부터 다시 판정합니다.\n"
      + "· 감사 기록에 남습니다.";
    if (await ask({ title: "작업 강제 중지", confirm: "다시 돌리기", danger: true, message })) reset.mutate(true);
  }

  return (
    <button className={cn(toolButton, "ml-0")} id="job-reset" disabled={reset.isPending} onClick={() => void onClick()}>
      {reset.isPending ? "끝내는 중…" : "강제 중지 · 다시 돌리기"}
    </button>
  );
}
