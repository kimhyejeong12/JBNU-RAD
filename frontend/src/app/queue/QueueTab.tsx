import { useMe } from "@/app/session/me";
import { useUi } from "@/app/ui/state/UiContext";
import { QueueHead } from "./QueueHead";
import { SummaryCards } from "./SummaryCards";
import { QueueTable } from "./QueueTable";
import { RequestForm } from "@/features/requests/RequestForm";

// 검토 현황 — 요약 카드는 이 목록의 등급 필터라 탭 안에 둡니다. 신청서는 일반 사용자의 내 신청 메뉴에서만.
export function QueueTab() {
  const me = useMe();
  const { ui } = useUi();
  return (
    <div className="view-queue" id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={ui.mainTab !== "queue"}>
      {me.role === "user" && <RequestForm hidden={ui.view !== "mine"} />}
      <SummaryCards />
      <section className="card queue">
        <QueueHead />
        <QueueTable />
      </section>
    </div>
  );
}
