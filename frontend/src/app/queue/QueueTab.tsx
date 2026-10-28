import { useUi } from "@/app/ui/UiContext";
import { LEVEL_VIEWS, VIEWS } from "@/app/views";
import { QueueHead } from "./QueueHead";

// 검토 현황 — 요약 카드는 이 목록의 등급 필터라 탭 안에 둡니다. 목록 · 신청서 · 요약 카드는 다음 작업에서 채웁니다.
export function QueueTab() {
  const { ui } = useUi();
  const cols = ui.view ? VIEWS[ui.view].cols : [];
  return (
    <div className="view-queue" id="view-queue" role="tabpanel" aria-labelledby="tab-queue" hidden={ui.mainTab !== "queue"}>
      <section className="card req-form" id="req-form" hidden={ui.view !== "mine"} />
      <section className="stats" id="stats" hidden={!ui.view || !LEVEL_VIEWS.has(ui.view)} />
      <section className="card queue">
        <QueueHead />
        <div className="table">
          <div className="tr thead" id="thead">{cols.map((c) => <span key={c}>{c}</span>)}<span /></div>
          <div id="rows" />
        </div>
      </section>
    </div>
  );
}
