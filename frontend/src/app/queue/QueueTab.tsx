import { useMe } from "@/app/session/me";
import { useUi } from "@/app/ui/state/UiContext";
import { QueueHead } from "./QueueHead";
import { QueueTable } from "./QueueTable";
import { RequestForm } from "@/features/requests/RequestForm";
import { cn } from "@/shared/lib/cn";
import { card } from "@/shared/ui/base/styles";

// 검토 현황 — 거르기(결재 단계 · 등급)는 목록 머리에 있습니다. 신청서는 일반 사용자의 내 신청 메뉴에서만.
// 일반 사용자는 왼쪽 신청서 · 오른쪽 내 신청 목록으로 나란히 둡니다 (위아래로 쌓으면 신청 뒤 상태를 보려고 스크롤해야 해서). 신청서는 목록이 길어도 위에 붙어 있고, 좁은 화면에서는 위아래로.
export function QueueTab() {
  const me = useMe();
  const { ui } = useUi();
  const list = (
    <section className={cn(card, "flex min-h-80 flex-col")}>
      <QueueHead />
      <QueueTable />
    </section>
  );
  if (me.role === "user") {
    return (
      <div className="grid grid-cols-[minmax(0,11fr)_minmax(0,9fr)] items-start gap-3.5 narrow:grid-cols-[minmax(0,1fr)]" id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={ui.mainTab !== "queue"}>
        <div className="sticky top-0 narrow:static"><RequestForm hidden={ui.view !== "mine"} /></div>
        {list}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3.5" id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={ui.mainTab !== "queue"}>
      {list}
    </div>
  );
}
