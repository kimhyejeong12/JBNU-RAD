import { useMe } from "@/app/session/me";
import { useUi } from "@/app/ui/state/UiContext";
import { QueueHead } from "./QueueHead";
import { QueueTable } from "./QueueTable";
import { RequestForm } from "@/features/requests/RequestForm";
import { MineList } from "@/features/requests/MineList";
import { cn } from "@/shared/lib/cn";
import { card } from "@/shared/ui/base/styles";

// 검토 현황 — 거르기(결재 단계 · 등급)는 목록 머리에 있습니다. 신청서는 일반 사용자의 내 신청 메뉴에서만.
// 일반 사용자는 신청서 위 · 내 신청 목록 아래 (목록이 처음엔 결재 중만 보여 짧아서 한 화면에 들어옵니다 — 11/2에 좌우로 나눴다가 오른쪽이 비어 되돌림).
export function QueueTab() {
  const me = useMe();
  const { ui } = useUi();
  return (
    <div className="flex flex-col gap-3.5" id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={ui.mainTab !== "queue"}>
      {me.role === "user" ? (
        <>
          <RequestForm hidden={ui.view !== "mine"} />
          <MineList />
        </>
      ) : (
        <section className={cn(card, "flex min-h-80 flex-col")}>
          <QueueHead />
          <QueueTable />
        </section>
      )}
    </div>
  );
}
