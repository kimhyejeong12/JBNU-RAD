import type { View } from "@/app/views";
import { PanelHead } from "@/shared/ui/PanelHead";

// 빈 패널도 메뉴를 따릅니다. 일반 사용자에게는 AI 문구를 보이지 않습니다.
export function EmptyQueuePanel({ view }: { view: View | null }) {
  const [title, text] = view === "mine"
    ? ["내 신청", <>신청하거나 목록에서 신청을 고르면<br />결재 상태와 기록이 표시됩니다.</>]
    : view === "requests"
      ? ["권한 신청 검토", <>목록에서 신청을 선택하면<br />신청 내용 · AI 판정 · 결재 기록이 표시됩니다.</>]
      : ["AI 판단 근거", <>목록에서 항목을 선택하면<br />AI 판단 근거와 권고가 표시됩니다.</>];
  return (
    <>
      <PanelHead title={title} />
      <div className="panel-body"><div className="empty">{text}</div></div>
    </>
  );
}
