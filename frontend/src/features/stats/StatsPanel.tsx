import type { ReactNode } from "react";
import { STAT_TITLES, SUSPECT_COLOR } from "./lib";
import { useStatsData } from "./useStatsData";
import { useClauses } from "@/app/data";
import { useUi } from "@/app/ui/UiContext";
import { PanelHead } from "@/app/ui/panel";
import type { Stats, Suspect, UserStats } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { Icon } from "@/shared/ui/Icon";
import { KvTable, Section } from "@/shared/ui/parts";
import { Sparkline } from "@/shared/ui/charts/parts";

// 통계 패널 — 고른 막대 · 줄의 자세한 내용과 운영자가 이어 볼 곳(노드 탭 · 로그 조회 · 결재함 · 로그 감시 판정).
export function StatsPanel() {
  const { ui } = useUi();
  const { kind, sys, usr } = useStatsData();
  const sel = ui.stats.selected;
  const d = kind === "stats" ? sys.data : usr.data;
  if (!d || !sel) return <Body title={STAT_TITLES[kind]} subject="막대 · 줄을 고르세요"><p className="note">막대를 누르면 자세한 내용이 나옵니다.</p></Body>;
  if (sel.kind === "node" && sys.data) return <NodePanel d={sys.data} node={sel.key} />;
  if (sel.kind === "module" && sys.data) return <ModulePanel d={sys.data} module={sel.key} />;
  if (sel.kind === "suspect" && usr.data) return <SuspectPanel d={usr.data} suspectKey={sel.key} />;
  return <Body title={STAT_TITLES[kind]} subject="막대 · 줄을 고르세요"><p className="note">막대를 누르면 자세한 내용이 나옵니다.</p></Body>;
}

function Body({ title, subject, children }: { title: string; subject: string; children?: ReactNode }) {
  return (
    <>
      <PanelHead title={title} />
      <div className="panel-body"><p className="subject">{subject}</p>{children}</div>
    </>
  );
}

function NodePanel({ d, node }: { d: Stats; node: string }) {
  const { gotoNode } = useUi();
  const clauses = useClauses();
  const n = d.servers.nodes.find((x) => x.node === node);
  if (!n) return <Body title="보안 통계" subject="기간 안에 없는 노드입니다" />;
  const hit = d.servers.clauses.filter((c) => c.nodes.includes(n.node));
  return (
    <Body title="서버 등급 변화" subject={n.node}>
      <KvTable rows={[["마지막 등급", n.level || "판정 없음"], ["기간 안 변화", n.trend],
        ["점검", n.grades.map((g) => `${stamp(g.at)} ${g.level}`).join("\n") || "없음"], ["설정이 바뀐 수집", `${n.changed} / ${n.collected}`]]} />
      {hit.length > 0 && (
        <Section icon="warn" title="걸린 조항">
          <div className="box pre">{hit.map((c) => `${clauses.label(c.source)} — ${c.items.filter((i) => i.startsWith(n.node + " ")).map((i) => i.slice(n.node.length + 3)).join(", ")}`).join("\n")}</div>
        </Section>
      )}
      <div className="sec"><button className="rerun" id="stat-go" onClick={() => gotoNode(n.node)}><Icon name="server" className="sm" />노드 탭에서 보기</button></div>
    </Body>
  );
}

function ModulePanel({ d, module }: { d: Stats; module: string }) {
  const m = d.servers.modules.find((x) => x.module === module);
  if (!m) return <Body title="보안 통계" subject="기간 안에 없는 모듈입니다" />;
  return (
    <Body title="노드 위협 데이터" subject={m.module}>
      <KvTable rows={[["위험", `${m["위험"]}건`], ["주의", `${m["주의"]}건`], ["걸린 서버", m.nodes.join(", ")]]} />
      <Section icon="warn" title="항목 — 노드 · 지금 값"><div className="box pre">{m.items.join("\n")}</div></Section>
    </Body>
  );
}

function SuspectPanel({ d, suspectKey }: { d: UserStats; suspectKey: string }) {
  const { navigate, openLogs, gotoActiveGrant, gotoEvent } = useUi();
  const p = d.suspects.find((x) => x.key === suspectKey);
  if (!p) return <Body title="위협 예측" subject="예측에 없는 사용자입니다" />;
  const g = p.signals || {};
  const r = p.records || {};
  const found = p.log_id ? d.events.users.find((u) => u.log_id === p.log_id) : undefined;
  const tone = SUSPECT_COLOR[p.level];
  return (
    <Body title="위협 예측" subject={p.subject}>
      {p.failed ? <div className="box fail">예측 실패: {p.error || ""}</div> : (
        <>
          <div className={`rec-line lv-${tone}`}><Icon name={LEVEL_ICON[tone]} />의심 {p.score}점 · {p.level}</div>
          <Section icon="activity" title="예측 이유"><div className="box">{p.reason}</div></Section>
          <Section icon="ok" title="확인할 점"><div className="box">{p.watch}</div></Section>
        </>
      )}
      <Section icon="key" title="지금 가진 권한">
        {p.held == null ? <p className="note">계정 미연결 — 권한을 확인할 수 없습니다.</p>
          : p.held.length ? (
            <div className="held">
              {p.held.map((h) => (
                <button className="held-row" key={h.request_no} onClick={() => gotoActiveGrant(h.request_no)}>
                  <b>{h.access}</b>
                  <span>{[h.system, h.category].filter(Boolean).join(" · ") || h.code || ""}</span>
                  <span className="when">{h.period_end ? `${h.period_end}까지` : "기간 없음"}</span>
                </button>
              ))}
            </div>
          ) : <p className="note">승인된 유효 권한이 없습니다.</p>}
      </Section>
      <Section icon="warn" title="행동 신호 (최근 7일 vs 이전 4주)">
        {g.highlights?.length ? <div className="box pre">{g.highlights.join("\n")}</div> : <p className="note">눈에 띄는 신호가 없습니다.</p>}
        {g.subject ? (
          <KvTable rows={[["최근 · 평소 로그", `${g.recent_events}건 · ${g.baseline_events}건`],
            ["하루 양", `${g.baseline_daily_volume} → ${g.recent_daily_volume}${g.volume_ratio != null ? ` (${g.volume_ratio}배)` : ""}`],
            ["근무 시간 밖 · 예외", `${Math.round((g.off_hours_ratio ?? 0) * 100)}% · ${Math.round((g.exception_ratio ?? 0) * 100)}%`],
            ["민감 문서", `${g.sensitive_events}건${g.sensitive_words?.length ? ` (${g.sensitive_words.join(", ")})` : ""}`],
            ["30분 안 최대", `${g.max_burst_30min}건`], ["첫 · 마지막 로그", `${stamp(g.first_seen)} · ${stamp(g.last_seen)}`]]} />
        ) : <p className="note">로그가 없습니다 (권한 신청 기록만).</p>}
      </Section>
      <Section icon="list" title="판정 · 신청 기록 (35일)">
        <KvTable rows={[["로그 감시", `위험 ${r["로그 위험"] || 0} · 주의 ${r["로그 주의"] || 0}`],
          ["권한 신청", `${r["신청"] || 0}건 · AI 위험 ${r["신청 위험"] || 0} · 반려 ${r["반려"] || 0} · 회수 ${r["회수"] || 0}`],
          ["계정", p.login_id || "계정 미연결 — 계정 관리에서 로그 사용자 ID 를 적으면 이어집니다"]]} />
      </Section>
      <Section icon="activity" title="의심 점수 흐름"><ScoreTrend p={p} /></Section>
      <p className="note">{stamp(p.created_at)} 예측</p>
      <div className="sec">
        {g.subject && <button className="rerun" id="stat-go" onClick={() => { navigate("events"); openLogs({ user: g.subject!, period: "month" }); }}><Icon name="search" className="sm" />이 사용자의 로그 조회</button>}
        {found && <button className="rerun" id="stat-go2" onClick={() => gotoEvent(`event:${found.keys[found.keys.length - 1]}`)}><Icon name="list" className="sm" />로그 감시 판정 보기</button>}
      </div>
    </Body>
  );
}

function ScoreTrend({ p }: { p: Suspect }) {
  const t = p.trend || [];
  if (t.length < 2) return <p className="note">예측이 한 번뿐이라 흐름이 아직 없습니다.</p>;
  return (
    <>
      <Sparkline width={(t.length - 1) * 20} height={40} stroke="var(--accent)" style={{ width: "100%", height: 40 }} ariaLabel="의심 점수 흐름"
        points={t.map((x, n) => [n * 20, 38 - (x.score / 100) * 36])} />
      <p className="note">{t.map((x) => x.score).join(" → ")} ({stamp(t[0].at)} ~ {stamp(t[t.length - 1].at)})</p>
    </>
  );
}
