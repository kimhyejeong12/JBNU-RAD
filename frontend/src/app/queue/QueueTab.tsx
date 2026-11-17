import { useMe } from "@/app/session/me";
import { useUi } from "@/app/ui/state/UiContext";
import { QueueHead } from "./QueueHead";
import { QueueTable } from "./QueueTable";
import { RequestForm } from "@/features/requests/RequestForm";
import { MineList } from "@/features/requests/MineList";
import { cn } from "@/shared/lib/cn";
import { card } from "@/shared/ui/base/styles";

export function QueueTab() {
  const me = useMe();
  const { ui } = useUi();
  return (
    // 운영자는 목록 카드가 남는 높이를 채우고 그 안에서 스크롤합니다 — 왼쪽 칸의 shrink-0 을 이 칸만 풉니다.
    <div className={cn("flex flex-col gap-3.5", me.role !== "user" && "min-h-0 flex-1 shrink!")} id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={ui.mainTab !== "queue"}>
      {me.role === "user" ? (
        // 왼쪽 신청서(1/3) · 오른쪽 내 신청(2/3) — 좁은 화면에서는 신청서가 위로 갑니다.
        <div className="mx-auto flex w-full max-w-[1600px] flex-col px-6 py-8 phone:px-4 phone:py-5">
          <div className="mb-6">
            <h1 className="m-0 text-2xl font-bold">권한 신청</h1>
            <p className="m-0 mt-1 text-sm text-ink-dim">업무에 필요한 시스템 권한을 신청하고 결재 진행 상황을 확인합니다.</p>
          </div>
          <div className="grid grid-cols-12 gap-8 narrow:grid-cols-1">
            <div className="col-span-4 flex flex-col narrow:col-span-1"><RequestForm /></div>
            <div className="col-span-8 flex min-w-0 flex-col narrow:col-span-1"><MineList /></div>
          </div>
        </div>
      ) : (
        <>
          <QueueHead />
          <section className={cn(card, "flex min-h-80 flex-1 flex-col overflow-hidden")}><QueueTable /></section>
        </>
      )}
    </div>
  );
}
