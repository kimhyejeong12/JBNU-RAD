import { Fragment } from "react";
import { useJobs, useResults } from "./data";
import { footerWarnings } from "./warnings";
import { RESULT_VIEWS } from "./views";
import { useUi } from "./ui/UiContext";
import { stamp } from "@/shared/lib/format";

// 계산 시각 · 분석 경고는 정책 관리 · 로그 감시 결과의 것이라 그 메뉴의 검토 현황에서만 보입니다.
export function Footer() {
  const { ui } = useUi();
  const results = useResults();
  const jobs = useJobs();
  const hidden = ui.mainTab !== "queue" || !ui.view || !RESULT_VIEWS.has(ui.view);
  if (hidden) return <footer className="foot" id="foot" hidden />;
  const warns = footerWarnings(results, jobs);
  return (
    <footer className="foot" id="foot">
      {results.generated_at ? `계산 시각 ${stamp(results.generated_at)}` : "아직 분석하지 않았습니다"}
      {warns.map((w, i) => <Fragment key={i}> · <span className="warn">{w}</span></Fragment>)}
    </footer>
  );
}
