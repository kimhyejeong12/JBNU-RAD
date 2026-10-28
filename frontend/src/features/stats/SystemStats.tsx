import { SafetyBand } from "./SafetyBand";
import { Tile } from "./Tile";
import { mergeDays, periodDays } from "./lib";
import type { StatSelection } from "@/app/ui/uiReducer";
import type { Stats } from "@/shared/api/types";
import { niceMax, pct } from "@/shared/lib/format";
import { HBars } from "@/shared/ui/charts/HBars";
import { DataTable, Legend, Meter, Sparkline, TableView } from "@/shared/ui/charts/parts";

interface Props { d: Stats; selected: StatSelection | null; onSelect: (kind: string, key: string) => void }

const threatOf = (d: Stats) => ({ threat: d.events.lines["주의"] + d.events.lines["위험"], logs: d.logs.count });
const gapsOf = (d: Stats) => d.servers.nodes.reduce((a, n) => ({ "위험": a["위험"] + n.threats["위험"], "주의": a["주의"] + n.threats["주의"] }), { "위험": 0, "주의": 0 });

// 보안 통계의 머리 — 시스템 안전 점수와 타일 넷.
export function SystemHead({ d, onSelect }: Props) {
  const L = d.events.lines;
  const { threat, logs } = threatOf(d);
  const days = periodDays(d.period, d.logs.days);
  const sv = d.servers;
  const gaps = gapsOf(d);
  const items = d.safety?.items ?? [];
  const nodeGroup = (f: (i: (typeof items)[number]) => boolean) => items.filter(f).map((i) => ({ key: i.node, label: i.node }));
  const { keys, byDay } = mergeDays(d.logs.days, d.events.days);
  const spark = keys.map((k) => byDay[k]);
  const sparkMax = Math.max(1, ...spark.map((y) => y["위험"] + y["주의"]));
  const peak = d.events.days.reduce<Stats["events"]["days"][number] | null>((a, x) => (x["주의"] + x["위험"] > (a ? a["주의"] + a["위험"] : 0) ? x : a), null);
  return (
    <>
      <div className="safety" id="stat-safety">
        <SafetyBand label="시스템 안전 점수" safety={d.safety} onSelect={onSelect} groups={[
          ["위험", nodeGroup((i) => i.level === "위험"), "node", "위험"], ["주의", nodeGroup((i) => i.level === "주의"), "node", "주의"],
          ["끊김", nodeGroup((i) => i.stale), "node", "none"], ["판정 없음", nodeGroup((i) => !i.level), "node", "none"]]} />
      </div>
      <div className="tiles" id="stat-tiles">
        <Tile label="위협 로그 비율" big={logs == null ? "—" : pct(threat, logs)} note={logs == null ? "로그를 읽지 못했습니다" : `${threat} / ${logs}건 · 위험 ${L["위험"]} · 주의 ${L["주의"]}`}>
          {logs ? <Meter segs={[["위험", L["위험"]], ["주의", L["주의"]]]} total={logs} /> : null}
        </Tile>
        <Tile label="위협 로그 빈도" big={days ? `하루 ${Math.round((threat / days) * 10) / 10}건` : "—"} note={peak ? `가장 많은 날 ${peak.day} ${peak["주의"] + peak["위험"]}건` : "주의 · 위험 로그 없음"}>
          {spark.length > 1 ? (
            <Sparkline width={spark.length * 4} height={24} stroke="var(--accent)" round style={{ width: "100%", height: 24, marginTop: 4 }}
              points={spark.map((x, n) => [n * 4 + 2, 22 - ((x["위험"] + x["주의"]) / sparkMax) * 20])} />
          ) : null}
        </Tile>
        <Tile label="위험 판정 로그" big={`${L["위험"]}건`} note={`위험 판정에 묶인 로그 · 주의 ${L["주의"]}건`}>
          {logs ? <Meter segs={[["위험", L["위험"]]]} total={logs} /> : null}
        </Tile>
        <Tile label="노드 위협 항목" big={`${gaps["위험"] + gaps["주의"]}건`} note={`위험 ${gaps["위험"]} · 주의 ${gaps["주의"]} · 위험 항목이 있는 서버 ${sv.nodes.filter((n) => n.threats["위험"]).length} / ${sv.nodes.length}대`}>
          {gaps["위험"] + gaps["주의"] ? <Meter segs={[["위험", gaps["위험"]], ["주의", gaps["주의"]]]} total={gaps["위험"] + gaps["주의"]} /> : null}
        </Tile>
      </div>
    </>
  );
}

// 위협 로그(날짜별 세로 막대)와 노드 위협 데이터(모듈별 · 노드별 가로 막대).
export function SystemSections(p: Props) {
  return (
    <>
      <ThreatLogs {...p} />
      <NodeThreats {...p} />
    </>
  );
}

// 날짜별 세로 막대 — 높이 = 그날 로그 건수(빈도), 색 조각 = 위험 · 주의 · 그 외 로그(비율).
function ThreatLogs({ d }: Props) {
  const { threat, logs } = threatOf(d);
  const { keys, byDay } = mergeDays(d.logs.days, d.events.days);
  const dayMax = niceMax(Math.max(1, ...keys.map((k) => Math.max(byDay[k].total, byDay[k]["위험"] + byDay[k]["주의"]))));
  // 날짜 글자는 그 막대 칸 가운데에 둡니다 (처음 · 가운데 · 끝).
  const at = (n: number) => `${((n + 0.5) / keys.length) * 100}%`;
  const ticks = [...new Set([0, Math.floor(keys.length / 2), keys.length - 1])];
  return (
    <section className="card" id="stat-events">
      <div className="logs-head"><h3>위협 로그 — 비율 · 빈도</h3><span className="logs-count">위협 로그 {threat} / {logs ?? "—"}건</span></div>
      {keys.length ? (
        <>
          <div className="chart">
            <div className="cols" role="img" aria-label="날짜별 로그 건수와 주의 · 위험 로그">
              {[1, 0.5].map((f) => <span key={f} className="grid" style={{ bottom: `${f * 100}%` }}><span>{Math.round(dayMax * f)}</span></span>)}
              {keys.map((k) => {
                const x = byDay[k];
                const other = Math.max(0, x.total - x["위험"] - x["주의"]);
                return (
                  <span key={k} className="col" tabIndex={0} data-tip={`${k}|로그 ${x.total}건 · 위험 ${x["위험"]} · 주의 ${x["주의"]} (${pct(x["위험"] + x["주의"], x.total)})`}>
                    <span className="stack">
                      {([["위험", x["위험"]], ["주의", x["주의"]], ["기타", other]] as [string, number][]).filter(([, v]) => v)
                        .map(([c, v]) => <span key={c} className={`mk ${c}`} style={{ height: `${(v / dayMax) * 100}%` }} />)}
                    </span>
                  </span>
                );
              })}
            </div>
            <div className="xaxis">
              {ticks.map((n, i) => <span key={n} style={{ left: i === 0 ? "0" : i === ticks.length - 1 ? "100%" : at(n) }}>{keys[n]}</span>)}
            </div>
          </div>
          <Legend items={[["위험", "위험"], ["주의", "주의"], ["기타", "그 외 로그"]]} />
        </>
      ) : <p className="sub">이 기간에 로그가 없습니다.</p>}
      <TableView>
        <DataTable head={["날짜", "로그", "위험", "주의", "비율"]} empty="" numCols={[1, 2, 3, 4]}
          rows={keys.map((k) => ({ key: k, cells: [k, byDay[k].total, byDay[k]["위험"], byDay[k]["주의"], pct(byDay[k]["위험"] + byDay[k]["주의"], byDay[k].total)] }))} />
      </TableView>
    </section>
  );
}

// 모듈별 · 노드별 위협 항목 가로 막대 — 누르면 패널이 열립니다.
function NodeThreats({ d, selected, onSelect }: Props) {
  const sv = d.servers;
  const gaps = gapsOf(d);
  const sel = (kind: string) => (selected?.kind === kind ? selected.key : null);
  return (
    <section className="card" id="stat-servers">
      <div className="logs-head"><h3>노드 위협 데이터</h3><span className="logs-count">서버 {sv.nodes.length} · 위협 항목 {gaps["위험"] + gaps["주의"]}</span></div>
      {sv.modules.length ? (
        <>
          <p className="chart-title">모듈별 위협 항목</p>
          <div className="chart">
            <HBars selectedKey={sel("module")} onSelect={(key) => onSelect("module", key)}
              rows={sv.modules.map((m) => ({ key: m.module, label: m.module, segs: [["위험", m["위험"]], ["주의", m["주의"]]], extra: `걸린 서버 ${m.nodes.join(", ")}` }))}
              value={(r) => { const m = sv.modules.find((x) => x.module === r.key)!; return `${m["위험"] + m["주의"]}건 · 서버 ${m.nodes.length}`; }} />
          </div>
        </>
      ) : <p className="sub">이 기간 서버 점검에서 찾은 위협 항목이 없습니다.</p>}
      {sv.nodes.length > 0 && (
        <>
          <p className="chart-title">노드별 위협 항목</p>
          <div className="chart">
            <HBars selectedKey={sel("node")} onSelect={(key) => onSelect("node", key)} max={Math.max(1, ...sv.nodes.map((n) => n.threats["위험"] + n.threats["주의"]))}
              rows={sv.nodes.map((n) => ({ key: n.node, label: n.node, segs: [["위험", n.threats["위험"]], ["주의", n.threats["주의"]]], extra: `마지막 등급 ${n.level || "판정 없음"} · 설정이 바뀐 수집 ${n.changed} / ${n.collected}` }))}
              value={(r) => { const n = sv.nodes.find((x) => x.node === r.key)!; return `${n.threats["위험"] + n.threats["주의"]}건 · ${n.level || "판정 없음"}`; }} />
          </div>
          <Legend items={[["위험", "위험"], ["주의", "주의"]]} />
        </>
      )}
      <TableView>
        <DataTable head={["노드", "마지막 등급", "위험", "주의", "등급 흐름", "설정이 바뀐 수집"]} empty=""
          rows={sv.nodes.map((n) => ({
            key: n.node, current: selected?.kind === "node" && selected.key === n.node, onSelect: () => onSelect("node", n.node),
            cells: [n.node, n.level || "판정 없음", <span key="r" className="num">{n.threats["위험"]}</span>, <span key="w" className="num">{n.threats["주의"]}</span>, n.grades.map((g) => g.level).join(" → "), <span key="c" className="num">{n.changed} / {n.collected}</span>],
          }))} />
        <DataTable head={["모듈", "위험", "주의", "걸린 서버"]} empty="" numCols={[1, 2]}
          rows={sv.modules.map((m) => ({ key: m.module, cells: [m.module, m["위험"], m["주의"], m.nodes.join(", ")] }))} />
      </TableView>
    </section>
  );
}
