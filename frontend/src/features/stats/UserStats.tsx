import { SUSPECT_COLOR } from "./constants";
import { SafetyBand } from "./SafetyBand";
import { Tile } from "./Tile";
import { trendMark, verdictsText } from "./lib";
import type { StatSelection } from "@/app/ui/uiReducer";
import { useStartJob } from "@/shared/api/jobs";
import type { Jobs, SuspectLevel, UserStats } from "@/shared/api/types";
import { pct, stamp } from "@/shared/lib/format";
import { HBars } from "@/shared/ui/charts/HBars";
import { DataTable, Legend, Meter, TableView } from "@/shared/ui/charts/parts";
import { Icon } from "@/shared/ui/Icon";

interface Props { d: UserStats; selected: StatSelection | null; onSelect: (kind: string, key: string) => void }

// 사용자 위협의 머리 — 사용자 안전 점수와 타일 넷. 사람마다 로그 감시 판정 수는 의심 점수 막대에 함께 둡니다.
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
      <div className="safety" id="stat-safety">
        <SafetyBand label="사용자 안전 점수" safety={d.safety} onSelect={onSelect}
          groups={[["의심 높음", susGroup("높음"), "suspect", "위험"], ["의심 보통", susGroup("보통"), "suspect", "주의"]]} />
      </div>
      <div className="tiles" id="stat-tiles">
        <Tile label="위협 사용자" big={`${ev.users.length}명`} note={`주의 · 위험 판정을 받은 사용자 · 위험 ${ev.users.filter((u) => u["위험"]).length}명`} />
        <Tile label="위협 예측 높음" big={`${sus.filter((p) => p.level === "높음").length}명`} note={`의심 점수 70 이상 · 보통 ${sus.filter((p) => p.level === "보통").length}명 · 반복 위협 ${repeat}명`} />
        <Tile label="신청 중 위험 비율" big={pct(ai["위험"] || 0, judged)} note={`위험 ${ai["위험"] || 0} · 주의 ${ai["주의"] || 0} / 판정 ${judged}건`}>
          {judged ? <Meter segs={[["위험", ai["위험"] || 0], ["주의", ai["주의"] || 0], ["정상", ai["정상"] || 0]]} total={judged} /> : null}
        </Tile>
        <Tile label="AI와 결재가 엇갈린 신청" big={`${rq.mismatches}건`} note="AI 위험인데 승인 · AI 정상인데 반려" />
      </div>
    </>
  );
}

// 위협 예측 — 행동 신호 · 판정 · 신청 기록으로 판정 모델이 낸 의심 점수 (높은 순, 막대 색은 의심 등급).
export function UserSections({ d, selected, onSelect, jobs }: Props & { jobs: Jobs | null }) {
  const start = useStartJob();
  const sus = d.suspects || [];
  const running = jobs?.running === "suspects";
  const latest = sus.map((p) => p.created_at).sort().pop();
  return (
    <section className="card" id="stat-suspects">
      <div className="logs-head">
        <h3>위협 예측 — 의심 점수</h3>
        <span className="logs-count">{sus.length ? `${sus.length}명 · ${stamp(latest)} 예측` : ""}</span>
        <button className="rerun run" id="suspects-now" disabled={!!jobs?.running} onClick={() => start.mutate("suspects")}>
          <Icon name="activity" className="sm" />{running ? `예측 중…${jobs?.total ? ` ${jobs.done}/${jobs.total}` : ""}` : "지금 예측"}
        </button>
      </div>
      <p className="sub">앞으로 보안 위협이 될 가능성(0~100)입니다. 먼저 살펴볼 사람을 고르는 예측이고, 결정은 사람이 합니다.</p>
      {sus.length ? (
        <>
          <div className="chart">
            <HBars max={100} selectedKey={selected?.kind === "suspect" ? selected.key : null} onSelect={(key) => onSelect("suspect", key)}
              rows={sus.filter((p) => !p.failed).map((p) => ({
                key: p.key, label: p.subject, segs: [[SUSPECT_COLOR[p.level], p.score]],
                extra: [...(p.signals.highlights || []).slice(0, 2), p.login_id ? "" : "계정 미연결"].filter(Boolean).join(" · ") || "눈에 띄는 신호 없음",
              }))}
              value={(r) => { const p = sus.find((x) => x.key === r.key)!; return [`${p.score}점 · ${p.level}${trendMark(p.trend)}`, verdictsText(p)].filter(Boolean).join(" · "); }} />
          </div>
          <Legend items={[["위험", "높음 (70 이상)"], ["주의", "보통 (40~69)"], ["정상", "낮음 (40 미만)"]]} />
          {sus.some((p) => p.failed) && <p className="sub">예측하지 못한 사람: {sus.filter((p) => p.failed).map((p) => p.subject).join(", ")}</p>}
        </>
      ) : <p className="sub">아직 예측이 없습니다. [지금 예측]을 누르세요.</p>}
      <TableView>
        <DataTable head={["사용자", "계정", "의심 점수", "로그 감시 판정", "눈에 띄는 신호", "예측 시각"]} empty=""
          rows={sus.map((p) => ({
            key: p.key, current: selected?.kind === "suspect" && selected.key === p.key, onSelect: () => onSelect("suspect", p.key),
            cells: [p.subject, p.login_id || "계정 미연결", p.failed ? "예측 실패" : <span key="s"><span className="num">{p.score}</span> {p.level}</span>,
              verdictsText(p) || "—", (p.signals.highlights || []).join(" · ") || "—", <span key="t" className="when">{stamp(p.created_at)}</span>],
          }))} />
      </TableView>
    </section>
  );
}
