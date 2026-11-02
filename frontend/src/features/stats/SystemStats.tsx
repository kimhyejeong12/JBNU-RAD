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

// 세로 막대 — 막대 칸에 올리거나 고르면(focus) 조각이 조금 밝아지고, 맨 위 조각만 위를 둥글게.
const MK = "last:rounded-t-sm group-hover:brightness-[1.12] group-focus:brightness-[1.12]";
// 날짜 글자는 그 자리 가운데 정렬 — 처음 글자는 왼쪽 끝, 마지막 글자는 오른쪽 끝에 맞춥니다.
const TICK = "absolute top-1 -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full";

const threatOf = (d: Stats) => ({ threat: d.events.lines["주의"] + d.events.lines["위험"], logs: d.logs.count });
const gapsOf = (d: Stats) => d.servers.nodes.reduce((a, n) => ({ "위험": a["위험"] + n.threats["위험"], "주의": a["주의"] + n.threats["주의"] }), { "위험": 0, "주의": 0 });

// 보안 통계의 머리 — 지금의 시스템 안전 점수와 기간 안 타일 둘. 숫자는 한 곳에만 둡니다 (11/2 — 타일 넷이 아래 카드 · 다른 타일과 겹쳤음).
// 위협 로그는 건수를 앞에 둡니다. 비율은 주의 판정 묶음의 줄을 모두 세어 크게 나오므로 작은 글씨로만 씁니다.
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

// 위협 로그(날짜별 세로 막대)와 노드별 위협 항목(표).
export function SystemSections(p: Props) {
  return (
    <>
      <ThreatLogs {...p} />
      <NodeThreats {...p} />
    </>
  );
}

// 날짜별 세로 막대 — 높이 = 그날 로그 건수(빈도), 색 조각 = 위험 · 주의 · 그 외 로그(비율). 시간 흐름이라 차트로 보고, [표]는 정확한 값을 볼 때.
function ThreatLogs({ d }: Props) {
  const [table, setTable] = useState(false);
  const { keys, byDay } = mergeDays(d.logs.days, d.events.days);
  const dayMax = niceMax(Math.max(1, ...keys.map((k) => Math.max(byDay[k].total, byDay[k]["위험"] + byDay[k]["주의"]))));
  // 날짜 글자는 그 막대 칸 가운데에 둡니다 (처음 · 가운데 · 끝).
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

// 노드별 위협 항목 — 노드마다 한 줄 (11/2, 모듈별 · 노드별 가로 막대 둘 대신). 값이 1~3이라 막대 길이에 뜻이 적고,
// 모듈별은 같은 항목을 다시 나눈 것이라 "걸린 모듈" 칸으로 둡니다. 마지막 등급과 항목 수는 칸을 나눕니다 —
// "2건 · 정상"처럼 붙이면 어긋나 보였습니다 (모델이 전체 등급과 항목 등급을 따로 냄). 줄을 누르면 패널(등급 변화 · 걸린 조항 · 노드 탭).
function NodeThreats({ d, selected, onSelect }: Props) {
  const sv = d.servers;
  const modulesOf = (node: string) => sv.modules.filter((m) => m.nodes.includes(node)).map((m) => m.module).join(", ") || "—";
  return (
    <section className={statCard} id="stat-servers">
      <div className={cardHead}><h3 className={cardTitle}>노드별 위협 항목</h3></div>
      {sv.nodes.length ? (
        <>
          {/* 패널은 고를 때만 열려, 누를 수 있다는 것을 여기서 알립니다 (줄은 마우스를 올려야 손 모양이 뜸). */}
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
