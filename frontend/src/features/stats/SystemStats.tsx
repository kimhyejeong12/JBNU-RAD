import { useState } from "react";
import { SafetyBand } from "./SafetyBand";
import { Tile } from "./Tile";
import { mergeDays, periodDays, statCard, statChart, statSafety, statSub, statTiles } from "./lib";
import type { StatSelection } from "@/app/ui/state/uiReducer";
import type { Stats } from "@/shared/api/types";
import { niceMax, pct } from "@/shared/lib/format";
import { DataTable, Legend, ViewSwitch } from "@/shared/ui/charts/parts";
import { cn } from "@/shared/lib/cn";
import { cardHead, cardTitle, mark, markTone, type MarkKey } from "@/shared/ui/base/styles";

interface Props { d: Stats; selected: StatSelection | null; onSelect: (kind: string, key: string) => void }

const MK = "last:rounded-t-sm group-hover:brightness-[1.12] group-focus:brightness-[1.12]";
const TICK = "absolute top-1 -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full";

const threatOf = (d: Stats) => ({ threat: d.events.lines["주의"] + d.events.lines["위험"], logs: d.logs.count });
const gapsOf = (d: Stats) => d.servers.nodes.reduce((a, n) => ({ "위험": a["위험"] + n.threats["위험"], "주의": a["주의"] + n.threats["주의"] }), { "위험": 0, "주의": 0 });

// 비율은 주의 판정 묶음의 줄을 모두 세어 크게 나오므로 작은 글씨로만 씁니다.
export function SystemHead({ d, onSelect }: Props) {
  const L = d.events.lines;
  const { threat, logs } = threatOf(d);
  const days = periodDays(d.period, d.logs.days);
  const sv = d.servers;
  const gaps = gapsOf(d);
  const items = d.safety?.items ?? [];
  const nodeGroup = (f: (i: (typeof items)[number]) => boolean) => items.filter(f).map((i) => ({ key: i.node, label: i.node }));
  return (
    <>
      <div className={statSafety} id="stat-safety">
        <SafetyBand label="시스템 안전 점수 · 지금" safety={d.safety} onSelect={onSelect} groups={[
          ["위험", nodeGroup((i) => i.level === "위험"), "node", "위험"], ["주의", nodeGroup((i) => i.level === "주의"), "node", "주의"],
          ["끊김", nodeGroup((i) => i.stale), "node", "none"], ["판정 없음", nodeGroup((i) => !i.level), "node", "none"]]} />
      </div>
      <div className={statTiles} id="stat-tiles">
        <Tile label="위협 로그" big={logs == null ? "—" : `${threat}건`}
          note={logs == null ? "로그를 읽지 못했습니다" : [`위험 ${L["위험"]} · 주의 ${L["주의"]}`, days ? `하루 ${Math.round((threat / days) * 10) / 10}건` : "", `전체 로그 ${logs}건의 ${pct(threat, logs)}`].filter(Boolean).join(" · ")} />
        <Tile label="노드 위협 항목" big={`${gaps["위험"] + gaps["주의"]}건`}
          note={`위험 ${gaps["위험"]} · 주의 ${gaps["주의"]} · 위험 항목이 있는 서버 ${sv.nodes.filter((n) => n.threats["위험"]).length} / ${sv.nodes.length}대`} />
      </div>
    </>
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

function ThreatLogs({ d }: Props) {
  const [table, setTable] = useState(false);
  const { keys, byDay } = mergeDays(d.logs.days, d.events.days);
  const dayMax = niceMax(Math.max(1, ...keys.map((k) => Math.max(byDay[k].total, byDay[k]["위험"] + byDay[k]["주의"]))));
  const at = (n: number) => `${((n + 0.5) / keys.length) * 100}%`;
  const ticks = [...new Set([0, Math.floor(keys.length / 2), keys.length - 1])];
  return (
    <section className={statCard} id="stat-events">
      <div className={cardHead}><h3 className={cardTitle}>위협 로그 — 날짜별</h3>
        <span className="ml-auto"><ViewSwitch id="stat-events-view" table={table} onChange={setTable} /></span></div>
      {!keys.length ? <p className={statSub}>이 기간에 로그가 없습니다.</p> : table ? (
        <DataTable scroll head={["날짜", "로그", "위험", "주의", "비율"]} empty="" numCols={[1, 2, 3, 4]}
          rows={keys.map((k) => ({ key: k, cells: [k, byDay[k].total, byDay[k]["위험"], byDay[k]["주의"], pct(byDay[k]["위험"] + byDay[k]["주의"], byDay[k].total)] }))} />
      ) : (
        <>
          <div className={statChart}>
            <div className="relative ml-7.5 flex h-35 items-end gap-0.5 border-b border-line" role="img" aria-label="날짜별 로그 건수와 주의 · 위험 로그">
              {[1, 0.5].map((f) => <span key={f} className="absolute -left-7.5 right-0 border-t border-line text-[10.5px] text-ink-dim tabular-nums" style={{ bottom: `${f * 100}%` }}><span className="absolute -top-1.75 left-0 w-6.5 bg-surface text-right">{Math.round(dayMax * f)}</span></span>)}
              {keys.map((k) => {
                const x = byDay[k];
                const other = Math.max(0, x.total - x["위험"] - x["주의"]);
                return (
                  <span key={k} className="group relative z-1 flex h-full flex-[1_1_0] justify-center outline-offset-2" tabIndex={0} data-tip={`${k}|로그 ${x.total}건 · 위험 ${x["위험"]} · 주의 ${x["주의"]} (${pct(x["위험"] + x["주의"], x.total)})`}>
                    <span className="flex h-full w-full max-w-6 flex-col-reverse gap-0.5">
                      {([["위험", x["위험"]], ["주의", x["주의"]], ["기타", other]] as [MarkKey, number][]).filter(([, v]) => v)
                        .map(([c, v]) => <span key={c} className={cn(mark, markTone[c], MK)} style={{ height: `${(v / dayMax) * 100}%` }} />)}
                    </span>
                  </span>
                );
              })}
            </div>
            <div className="relative ml-7.5 h-4.5 text-[11px] text-ink-dim tabular-nums">
              {ticks.map((n, i) => <span key={n} className={TICK} style={{ left: i === 0 ? "0" : i === ticks.length - 1 ? "100%" : at(n) }}>{keys[n]}</span>)}
            </div>
          </div>
          <Legend items={[["위험", "위험"], ["주의", "주의"], ["기타", "그 외 로그"]]} />
        </>
      )}
    </section>
  );
}

// 모델이 전체 등급과 항목 등급을 따로 내 붙이면 어긋나 보여서 칸을 나눕니다.
function NodeThreats({ d, selected, onSelect }: Props) {
  const sv = d.servers;
  const modulesOf = (node: string) => sv.modules.filter((m) => m.nodes.includes(node)).map((m) => m.module).join(", ") || "—";
  return (
    <section className={statCard} id="stat-servers">
      <div className={cardHead}><h3 className={cardTitle}>노드별 위협 항목</h3></div>
      {sv.nodes.length ? (
        <>
          {/* 줄은 마우스를 올려야 손 모양이 떠서 누를 수 있다는 것을 여기서 알립니다. */}
          <p className={statSub}>줄을 누르면 오른쪽에 등급 변화 · 걸린 조항이 열립니다.</p>
          <DataTable head={["노드", "마지막 등급", "위험 항목", "주의 항목", "걸린 모듈", "설정이 바뀐 수집"]} empty="" numCols={[2, 3]}
          rows={sv.nodes.map((n) => ({
            key: n.node, current: selected?.kind === "node" && selected.key === n.node, onSelect: () => onSelect("node", n.node),
            cells: [n.node, n.level || "판정 없음", n.threats["위험"], n.threats["주의"], modulesOf(n.node), <span key="c" className="tabular-nums">{n.changed} / {n.collected}</span>],
          }))} />
        </>
      ) : <p className={statSub}>이 기간 서버 점검 결과가 없습니다.</p>}
    </section>
  );
}
