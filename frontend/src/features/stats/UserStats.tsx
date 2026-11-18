import { SUSPECT_COLOR, periodVerdicts, suspectRows, trendMark, type StatView, type UserPick } from "./lib";
import { ScoreHead } from "./ScoreHead";
import { useResults } from "@/app/session/data";
import { DecisionCell } from "@/app/ui/panel/DecisionFoot";
import { JobReset } from "@/app/queue/QueueHead";
import { useStartJob, jobProgress } from "@/shared/api/jobs";
import type { Jobs, Suspect, UserStats } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { usePage } from "@/shared/lib/hooks";
import { Pager, TwoLine, CardHead } from "@/shared/ui/parts";
import { DataTable } from "@/shared/ui/charts";
import { Icon } from "@/shared/ui/Icon";
import { levelText, markTone, toolButton, cardCountInline, cardCol, cardNote } from "@/shared/ui/styles";
import { cn } from "@/shared/lib/cn";

type Props = StatView & { d: UserStats };

// 표는 한 쪽 10줄
const PAGE = 10;

// 의심 높음 · 보통 · 위협 사용자 줄을 누르면 아래 의심 점수 표가 그 사람들만. 엇갈린 결재는 기간 안 권한 신청
export function UserHead({ d, pick, onPick }: Props) {
  const ev = d.events.users;
  const n = (p: UserPick) => suspectRows(d, p).length;
  return (
    <ScoreHead label="사용자 안전 점수" safety={d.safety} none="예측 없음" pick={pick} onPick={onPick} rows={[
      { pick: "높음", dot: "위험", label: "의심 높음", sub: "점수 70 이상", value: `${n("높음")}명`, tone: n("높음") ? levelText["위험"] : undefined, none: !n("높음") },
      { pick: "보통", dot: "주의", label: "의심 보통", sub: "점수 40~69", value: `${n("보통")}명`, tone: n("보통") ? levelText["주의"] : undefined, none: !n("보통") },
      { pick: "events", label: "위협 사용자", sub: `위험 ${ev.filter((u) => u["위험"]).length}명, 반복 ${ev.filter((u) => u["위험"] + u["주의"] > 1).length}명`, value: `${ev.length}명`, none: !n("events") },
      { label: "AI와 결재가 엇갈린 신청", sub: "위험 승인, 정상 반려", value: `${d.requests.mismatches}건` },
    ]} />
  );
}

// 의심 점수는 기간과 무관한 마지막 예측임. 처리 상태는 패널의 결정과 같은 키
export function UserSections({ d, selected, onSelect, pick, jobs }: Props & { jobs: Jobs | null }) {
  const start = useStartJob();
  const decisions = useResults().decisions?.suspect;
  const sus = d.suspects || [];
  const rows = suspectRows(d, pick);
  const { shown, at, pages, setPage } = usePage(rows, PAGE);
  const running = jobs?.running === "suspects";
  const latest = sus.map((p) => p.created_at).sort().pop();
  return (
    <section className={cardCol} id="stat-suspects">
      <CardHead title="의심 점수">
        {/* 둘 다 오른쪽으로 밀면 버튼이 가운데로 떠서 버튼만 오른쪽 끝에 둠 */}
        <span className={cardCountInline}>{sus.length ? `${sus.length}명, ${stamp(latest)}` : ""}</span>
        <button className={toolButton} id="suspects-now" disabled={!!jobs?.running || start.isPending} onClick={() => start.mutate("suspects")}>
          <Icon name="activity" small />{running ? `예측 중…${jobProgress(jobs)}` : "지금 예측"}
        </button>
        <JobReset />
      </CardHead>
      {sus.length ? (
        <>
          <DataTable head={["사용자", "AI 판단", "로그 감시 판정", "눈에 띄는 신호", "처리 상태"]} empty="해당 없음"
            rows={shown.map((p) => ({
              key: p.key, current: selected?.kind === "suspect" && selected.key === p.key, onSelect: () => onSelect("suspect", p.key),
              cells: [
                <TwoLine key="u" title={p.subject} note={p.login_id || "계정 미연결"} />,
                p.failed ? <span key="s" className="text-ink-dim">예측 실패</span> : <ScoreCell key="s" p={p} />,
                periodVerdicts(d, p) || "—",
                <span key="g" className="line-clamp-1 text-ink-soft">{(p.signals.highlights || []).join(", ") || "—"}</span>,
                <DecisionCell key="d" decision={decisions?.[`suspect/${p.key}`]} />,
              ],
            }))} />
          {pages > 1 && <Pager className="py-3" at={at} pages={pages} onPage={setPage} />}
        </>
      ) : <p className={cardNote}>예측 없음</p>}
    </section>
  );
}

// 막대 · 점수 · 등급(등급 색) · 크게 오르내리면 화살표
function ScoreCell({ p }: { p: Suspect }) {
  if (!p.level) return null;   // 예측 실패는 부르는 쪽이 따로 적음
  const tone = SUSPECT_COLOR[p.level];
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-sm bg-canvas"><span className={cn("block h-full", markTone[tone])} style={{ width: `${p.score}%` }} /></span>
      <span><b className="tabular-nums">{p.score}</b> <b className={levelText[tone]}>{p.level}</b>{trendMark(p.trend)}</span>
    </span>
  );
}
