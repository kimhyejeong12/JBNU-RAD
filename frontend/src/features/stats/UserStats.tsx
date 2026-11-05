import { SUSPECT_COLOR, statCard, statSafety, statSub, statTiles, trendMark, verdictsText } from "./lib";
import { SafetyBand } from "./SafetyBand";
import { Tile } from "./Tile";
import type { StatSelection } from "@/app/ui/state/uiReducer";
import { JobReset } from "@/app/ui/jobs/JobReset";
import { useStartJob } from "@/shared/api/jobs";
import type { Jobs, Suspect, SuspectLevel, UserStats } from "@/shared/api/types";
import { pct, stamp } from "@/shared/lib/format";
import { DataTable, Meter } from "@/shared/ui/charts/parts";
import { Icon } from "@/shared/ui/base/Icon";
import { cardCount, cardHead, cardTitle, markTone, toolButton } from "@/shared/ui/base/styles";
import { cn } from "@/shared/lib/cn";

interface Props { d: UserStats; selected: StatSelection | null; onSelect: (kind: string, key: string) => void }

export function UserHead({ d, onSelect }: Props) {
  const ev = d.events;
  const rq = d.requests;
  const ai = rq.ai || {};
  const judged = rq.total - (ai["판정 없음"] || 0);
  const sus = d.suspects || [];
  const repeat = ev.users.filter((u) => u["위험"] + u["주의"] > 1).length;
  const susGroup = (lv: SuspectLevel) => sus.filter((p) => !p.failed && p.level === lv).map((p) => ({ key: p.key, label: p.subject }));
  return (
    <>
      <div className={statSafety} id="stat-safety">
        <SafetyBand label="사용자 안전 점수 · 지금" safety={d.safety} onSelect={onSelect} names={0}
          groups={[["의심 높음", susGroup("높음"), "suspect", "위험"], ["의심 보통", susGroup("보통"), "suspect", "주의"]]} />
      </div>
      <div className={statTiles} id="stat-tiles">
        <Tile label="위협 사용자" big={`${ev.users.length}명`} note={`주의 · 위험 판정을 받은 사람 · 위험 ${ev.users.filter((u) => u["위험"]).length}명 · 두 번 이상 ${repeat}명`} />
        <Tile label="신청 중 위험 비율" big={pct(ai["위험"] || 0, judged)} note={`위험 ${ai["위험"] || 0} · 주의 ${ai["주의"] || 0} / 판정 ${judged}건`}>
          {judged ? <Meter segs={[["위험", ai["위험"] || 0], ["주의", ai["주의"] || 0], ["정상", ai["정상"] || 0]]} total={judged} /> : null}
        </Tile>
        <Tile label="AI와 결재가 엇갈린 신청" big={`${rq.mismatches}건`} note="AI 위험인데 승인 · AI 정상인데 반려" />
      </div>
    </>
  );
}

// 의심 점수는 기간과 무관한 마지막 예측입니다.
export function UserSections({ d, selected, onSelect, jobs }: Props & { jobs: Jobs | null }) {
  const start = useStartJob();
  const sus = d.suspects || [];
  const running = jobs?.running === "suspects";
  const latest = sus.map((p) => p.created_at).sort().pop();
  return (
    <section className={statCard} id="stat-suspects">
      <div className={cardHead}>
        <h3 className={cardTitle}>위협 예측 — 의심 점수</h3>
        {/* 둘 다 오른쪽으로 밀면 버튼이 가운데로 떠서 버튼만 오른쪽 끝에 둡니다. */}
        <span className={cn(cardCount, "ml-0")}>{sus.length ? `${sus.length}명 · ${stamp(latest)} 예측` : ""}</span>
        <button className={toolButton} id="suspects-now" disabled={!!jobs?.running || start.isPending} onClick={() => start.mutate("suspects")}>
          <Icon name="activity" small />{running ? `예측 중…${jobs?.total ? ` ${jobs.done}/${jobs.total}` : ""}` : "지금 예측"}
        </button>
        <JobReset />
      </div>
      <p className={statSub}>앞으로 보안 위협이 될 가능성(0~100, 높음 70 이상 · 보통 40~69 · 낮음 40 미만)으로, 먼저 살펴볼 사람을 고르는 예측입니다. 줄을 누르면 오른쪽에 예측 이유 · 확인할 점 · 가진 권한이 열립니다.</p>
      {sus.length ? (
        <DataTable head={["사용자", "의심 점수", "로그 감시 판정", "눈에 띄는 신호", "계정"]} empty=""
          rows={sus.map((p) => ({
            key: p.key, current: selected?.kind === "suspect" && selected.key === p.key, onSelect: () => onSelect("suspect", p.key),
            cells: [p.subject, p.failed ? "예측 실패" : <ScoreCell key="s" p={p} />, verdictsText(p) || "—", (p.signals.highlights || []).join(" · ") || "—", p.login_id || "계정 미연결"],
          }))} />
      ) : <p className={statSub}>아직 예측이 없습니다. [지금 예측]을 누르세요.</p>}
    </section>
  );
}

function ScoreCell({ p }: { p: Suspect }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-sm bg-canvas"><span className={cn("block h-full", markTone[SUSPECT_COLOR[p.level]])} style={{ width: `${p.score}%` }} /></span>
      <span><b className="tabular-nums">{p.score}</b> {p.level}{trendMark(p.trend)}</span>
    </span>
  );
}
