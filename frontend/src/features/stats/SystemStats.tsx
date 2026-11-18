import { ScoreHead } from "./ScoreHead";
import { mergeDays, nodeLines, pickNodes, statChart, type NodePick, type StatView } from "./lib";
import type { Stats } from "@/shared/api/types";
import { niceMax, pct } from "@/shared/lib/format";
import { usePage } from "@/shared/lib/hooks";
import { LevelLabel, Pager, TwoLine, CardHead } from "@/shared/ui/parts";
import { DataTable, Legend, XTicks, YGrid } from "@/shared/ui/charts";
import { cn } from "@/shared/lib/cn";
import { mark, markTone, type MarkKey, cardCol, cardNote, levelText } from "@/shared/ui/styles";

type Props = StatView & { d: Stats };

const MK = "last:rounded-t-sm group-hover:brightness-[1.12] group-focus:brightness-[1.12]";
// 표는 한 쪽 10줄
const PAGE = 10;

const threatOf = (d: Stats) => ({ threat: d.events.lines["주의"] + d.events.lines["위험"], logs: d.logs.count });
const gapsOf = (d: Stats) => d.servers.nodes.reduce((a, n) => ({ "위험": a["위험"] + n.threats["위험"], "주의": a["주의"] + n.threats["주의"] }), { "위험": 0, "주의": 0 });

// 등급별 노드 줄을 누르면 아래 노드 표가 그 노드만. 위협 로그 비율은 주의 판정 묶음의 줄을 모두 세어 크게 나오므로 작은 글씨로만 씀
export function SystemHead({ d, pick, onPick }: Props) {
  const L = d.events.lines;
  const { threat, logs } = threatOf(d);
  const gaps = gapsOf(d);
  const lines = nodeLines(d);
  const n = (p: NodePick) => pickNodes(lines, p).length;
  return (
    <ScoreHead label="시스템 안전 점수" safety={d.safety} none="점검 없음" pick={pick} onPick={onPick} rows={[
      { pick: "위험", dot: "위험", label: "위험 노드", sub: `위험 항목 ${gaps["위험"]}`, value: `${n("위험")}대`, tone: n("위험") ? levelText["위험"] : undefined, none: !n("위험") },
      { pick: "주의", dot: "주의", label: "주의 노드", sub: `주의 항목 ${gaps["주의"]}`, value: `${n("주의")}대`, tone: n("주의") ? levelText["주의"] : undefined, none: !n("주의") },
      { pick: "none", dot: null, label: "끊김, 판정 없음", sub: `끊김 ${lines.filter((x) => x.stale).length}, 판정 없음 ${lines.filter((x) => !x.level).length}`, value: `${n("none")}대`, none: !n("none") },
      { label: "위협 로그", value: logs == null ? "—" : `${threat}건`,
        sub: logs == null ? "로그를 읽지 못했습니다" : `위험 ${L["위험"]}, 주의 ${L["주의"]} / 전체 ${logs}건 (${pct(threat, logs)})` },
    ]} />
  );
}

export function SystemSections(p: Props) {
  return (
    <>
      <ThreatLogs {...p} />
      <NodeThreats {...p} />
    </>
  );
}

// 날짜별 값은 막대에 마우스를 올리면 보임 (종합 대시보드 그래프와 같이 표 전환 없음)
function ThreatLogs({ d }: Props) {
  const { keys, byDay } = mergeDays(d.logs.days, d.events.days);
  const dayMax = niceMax(Math.max(1, ...keys.map((k) => Math.max(byDay[k].total, byDay[k]["위험"] + byDay[k]["주의"]))));
  return (
    <section className={cardCol} id="stat-events">
      <CardHead title="위협 로그 날짜별" />
      {!keys.length ? <p className={cardNote}>로그 없음</p> : (
        <>
          <div className={statChart}>
            <div className="relative ml-7.5 flex h-35 items-end gap-0.5 border-b border-line" role="img" aria-label="날짜별 로그 건수">
              <YGrid lines={[[Math.round(dayMax), 1], [Math.round(dayMax * 0.5), 0.5]]} />
              {keys.map((k) => {
                const x = byDay[k];
                const other = Math.max(0, x.total - x["위험"] - x["주의"]);
                return (
                  <span key={k} className="group relative z-1 flex h-full flex-[1_1_0] justify-center outline-offset-2" tabIndex={0} data-tip={`${k}|로그 ${x.total}건, 위험 ${x["위험"]}, 주의 ${x["주의"]} (${pct(x["위험"] + x["주의"], x.total)})`}>
                    <span className="flex h-full w-full max-w-6 flex-col-reverse gap-0.5">
                      {([["위험", x["위험"]], ["주의", x["주의"]], ["기타", other]] as [MarkKey, number][]).filter(([, v]) => v)
                        .map(([c, v]) => <span key={c} className={cn(mark, markTone[c], MK)} style={{ height: `${(v / dayMax) * 100}%` }} />)}
                    </span>
                  </span>
                );
              })}
            </div>
            <XTicks count={keys.length} label={(n) => keys[n]} />
          </div>
          <Legend items={[["위험", "위험"], ["주의", "주의"], ["기타", "그 외 로그"]]} />
        </>
      )}
    </section>
  );
}

// 켜 둔 노드와 기간 안 점검을 합친 표 — 기간 안 점검이 없는 노드도 줄을 남겨 패널에서 지금 상태를 봄
function NodeThreats({ d, selected, onSelect, pick }: Props) {
  const sv = d.servers;
  const all = nodeLines(d);
  const rows = pickNodes(all, pick);
  const { shown, at, pages, setPage } = usePage(rows, PAGE);
  const modulesOf = (node: string) => sv.modules.filter((m) => m.nodes.includes(node)).map((m) => m.module).join(", ") || "—";
  return (
    <section className={cardCol} id="stat-servers">
      <CardHead title="노드별 점검" />
      {all.length ? (
        <>
          <DataTable head={["노드", "마지막 등급", "위협 항목", "걸린 모듈", "설정이 바뀐 수집"]} empty="해당 없음"
            rows={shown.map((r) => ({
              key: r.node, current: selected?.kind === "node" && selected.key === r.node, onSelect: () => onSelect("node", r.node),
              cells: [
                <TwoLine key="n" title={r.node} note={r.stale ? "수집 끊김" : !r.stat ? "기간 내 점검 없음" : undefined} />,
                r.level ? <LevelLabel key="l" level={r.level} /> : <span key="l" className="text-ink-dim">판정 없음</span>,
                r.stat ? `위험 ${r.stat.threats["위험"]}, 주의 ${r.stat.threats["주의"]}` : "—",
                r.stat ? modulesOf(r.node) : "—",
                r.stat ? <span key="c" className="tabular-nums">{r.stat.changed} / {r.stat.collected}</span> : "—",
              ],
            }))} />
          {pages > 1 && <Pager className="py-3" at={at} pages={pages} onPage={setPage} />}
        </>
      ) : <p className={cardNote}>점검 결과 없음</p>}
    </section>
  );
}
