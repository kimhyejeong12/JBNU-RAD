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
