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
    const message = `${name}을(를) 끝내고 처음부터 다시 돌립니다.`;
    if (await ask({ title: "작업 강제 중지", confirm: "다시 돌리기", danger: true, message })) reset.mutate(true);
  }

  return (
    <button className={cn(toolButton, "ml-0")} id="job-reset" disabled={reset.isPending} onClick={() => void onClick()}>
      {reset.isPending ? "끝내는 중…" : "다시 돌리기"}
    </button>
  );
}
