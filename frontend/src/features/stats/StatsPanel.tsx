import type { ReactNode } from "react";
import { STAT_TITLES, SUSPECT_COLOR } from "./lib";
import { useStatsData } from "./useStatsData";
import { useClauses } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { PanelHead } from "@/app/ui/panel/Panel";
import type { Stats, Suspect, UserStats } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { Icon } from "@/shared/ui/base/Icon";
import { KvTable, Section } from "@/shared/ui/base/parts";
import { Sparkline } from "@/shared/ui/charts/parts";
import { cn } from "@/shared/lib/cn";
import { box, boxPre, levelText, note, panelBody, recLine, subject as subjectCls, toolButton } from "@/shared/ui/base/styles";

const HELD_ROW = "grid cursor-pointer grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left text-[13px] font-[inherit] [font-weight:inherit] leading-[inherit] hover:border-ink-dim";
const HELD_SUB = "text-[12px] text-ink-dim";

export function StatsPanel() {
  const { ui } = useUi();
  const { kind, sys, usr } = useStatsData();
  const sel = ui.stats.selected;
  const d = kind === "stats" ? sys.data : usr.data;
  if (!d || !sel) return <Body title={STAT_TITLES[kind]} subject="항목을 고르세요" />;
  if (sel.kind === "node" && sys.data) return <NodePanel d={sys.data} node={sel.key} />;
  if (sel.kind === "suspect" && usr.data) return <SuspectPanel d={usr.data} suspectKey={sel.key} />;
  return <Body title={STAT_TITLES[kind]} subject="항목을 고르세요" />;
}

function Body({ title, subject, children }: { title: string; subject: string; children?: ReactNode }) {
  return (
    <>
      <PanelHead title={title} />
      <div className={panelBody}><p className={subjectCls}>{subject}</p>{children}</div>
    </>
  );
}

function NodePanel({ d, node }: { d: Stats; node: string }) {
  const { gotoNode } = useUi();
  const clauses = useClauses();
  const n = d.servers.nodes.find((x) => x.node === node);
  // 이 기간에 점검이 없는 노드도 막다른 곳이 되지 않게 지금 상태와 [노드 탭에서 보기]를 둡니다.
  const now = d.safety?.items?.find((i) => i.node === node);
  const stale: [string, string][] = now?.stale ? [["수집", "끊김"]] : [];
  const go = <div className="mt-4.5"><button className={toolButton} id="stat-go" onClick={() => gotoNode(node)}><Icon name="server" small />노드 탭에서 보기</button></div>;
  if (!n) {
    return (
      <Body title="서버 등급 변화" subject={node}>
        <KvTable rows={[["마지막 등급", now?.level || "판정 없음"], ...stale]} />
        <p className={note}>점검 결과 없음</p>
        {go}
      </Body>
    );
  }
  const hit = d.servers.clauses.filter((c) => c.nodes.includes(n.node));
  return (
    <Body title="서버 등급 변화" subject={n.node}>
      <KvTable rows={[["마지막 등급", n.level || "판정 없음"], ...stale, ["기간 안 변화", n.trend],
        ["점검", n.grades.map((g) => `${stamp(g.at)} ${g.level}`).join("\n") || "없음"], ["설정이 바뀐 수집", `${n.changed} / ${n.collected}`]]} />
      {hit.length > 0 && (
        <Section icon="warn" title="걸린 조항">
          <div className={boxPre}>{hit.map((c) => `${clauses.label(c.source)} — ${c.items.filter((i) => i.startsWith(n.node + " ")).map((i) => i.slice(n.node.length + 3)).join(", ")}`).join("\n")}</div>
        </Section>
      )}
      {go}
    </Body>
  );
}

function SuspectPanel({ d, suspectKey }: { d: UserStats; suspectKey: string }) {
  const { navigate, openLogs, gotoActiveGrant, gotoEvent } = useUi();
  const p = d.suspects.find((x) => x.key === suspectKey);
  if (!p) return <Body title="의심 점수" subject="예측 없음" />;
  const g = p.signals || {};
  const r = p.records || {};
  const found = p.log_id ? d.events.users.find((u) => u.log_id === p.log_id) : undefined;
  const tone = SUSPECT_COLOR[p.level];
  return (
    <Body title="의심 점수" subject={p.subject}>
      {p.failed ? <div className={box}>예측 실패: {p.error || ""}</div> : (
        <>
          <div className={cn(recLine, levelText[tone])}><Icon name={LEVEL_ICON[tone]} className="size-5" />{p.score}점 {p.level}</div>
          <Section icon="activity" title="예측 이유"><div className={box}>{p.reason}</div></Section>
          <Section icon="ok" title="확인할 점"><div className={box}>{p.watch}</div></Section>
        </>
      )}
      <Section icon="key" title="지금 가진 권한">
        {p.held == null ? <p className={note}>계정 미연결</p>
          : p.held.length ? (
            <div className="grid gap-1.5">
              {p.held.map((h) => (
                <button className={HELD_ROW} key={h.request_no} onClick={() => gotoActiveGrant(h.request_no)}>
                  <b>{h.access}</b>
                  <span className={HELD_SUB}>{[h.system, h.category].filter(Boolean).join(", ") || h.code || ""}</span>
                  <span className={cn(HELD_SUB, "col-start-2 row-start-1")}>{h.period_end ? `${h.period_end}까지` : "기간 없음"}</span>
                </button>
              ))}
            </div>
          ) : <p className={note}>없음</p>}
      </Section>
      <Section icon="warn" title="행동 신호 (최근 7일)">
        {g.highlights?.length ? <div className={boxPre}>{g.highlights.join("\n")}</div> : <p className={note}>없음</p>}
        {g.subject ? (
          <KvTable rows={[["로그 (최근 / 평소)", `${g.recent_events} / ${g.baseline_events}건`],
            ["하루 양", `${g.baseline_daily_volume} → ${g.recent_daily_volume}${g.volume_ratio != null ? ` (${g.volume_ratio}배)` : ""}`],
            ["근무 시간 밖", `${Math.round((g.off_hours_ratio ?? 0) * 100)}%`], ["예외 승인", `${Math.round((g.exception_ratio ?? 0) * 100)}%`],
            ["민감 문서", `${g.sensitive_events}건${g.sensitive_words?.length ? ` (${g.sensitive_words.join(", ")})` : ""}`],
            ["30분 안 최대", `${g.max_burst_30min}건`], ["로그 기간", `${stamp(g.first_seen)} ~ ${stamp(g.last_seen)}`]]} />
        ) : <p className={note}>로그 없음</p>}
      </Section>
      <Section icon="list" title="기록 (35일)">
        <KvTable rows={[["로그 감시", `위험 ${r["로그 위험"] || 0}, 주의 ${r["로그 주의"] || 0}`],
          ["권한 신청", `${r["신청"] || 0}건`], ["반려", `${r["반려"] || 0}건`], ["회수", `${r["회수"] || 0}건`],
          ["계정", p.login_id || "미연결"]]} />
      </Section>
      <Section icon="activity" title="의심 점수 흐름"><ScoreTrend p={p} /></Section>
      <p className={note}>{stamp(p.created_at)}</p>
      <div className="mt-4.5">
        {g.subject && <button className={toolButton} id="stat-go" onClick={() => { navigate("events"); openLogs({ user: g.subject!, period: "month" }); }}><Icon name="search" small />로그 조회</button>}
        {found && <button className={toolButton} id="stat-go2" onClick={() => gotoEvent(`event:${found.keys[found.keys.length - 1]}`)}><Icon name="list" small />로그 감시 판정 보기</button>}
      </div>
    </Body>
  );
}

function ScoreTrend({ p }: { p: Suspect }) {
  const t = p.trend || [];
  if (t.length < 2) return <p className={note}>기록 1회</p>;
  return (
    <>
      <Sparkline width={(t.length - 1) * 20} height={40} stroke="var(--color-risk)" style={{ width: "100%", height: 40 }} ariaLabel="의심 점수 흐름"
        points={t.map((x, n) => [n * 20, 38 - (x.score / 100) * 36])} />
      <p className={note}>{t.map((x) => x.score).join(" → ")} ({stamp(t[0].at)} ~ {stamp(t[t.length - 1].at)})</p>
    </>
  );
}
