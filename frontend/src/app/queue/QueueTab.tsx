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
    <div className="flex flex-col gap-3.5" id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={ui.mainTab !== "queue"}>
      {me.role === "user" ? (
        // 왼쪽 신청서 · 오른쪽 내 신청 — 좁은 화면에서는 신청서가 위로 갑니다.
        <div className="grid grid-cols-[minmax(320px,4fr)_minmax(0,8fr)] items-start gap-4.5 narrow:grid-cols-[minmax(0,1fr)]">
          <RequestForm />
          <MineList />
        </div>
      ) : (
        <section className={cn(card, "flex min-h-80 flex-col")}>
          <QueueHead />
          <QueueTable />
        </section>
      )}
    </div>
  );
}
