import type { FormEvent, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { nodeState, type NodeStateClass } from "./lib";
import { useCreateNode, useNodeAction, type NodeAct } from "./api";
import { NodeKey } from "./NodeKey";
import { useQueue } from "@/app/queue/useQueue";
import { useUi } from "@/app/ui/UiContext";
import { PanelHead, PanelMsg } from "@/app/ui/panel";
import { nodeQuery, nodesQuery } from "@/shared/api/queries";
import type { NodeDetail, NodeRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { KvTable, LevelDot, Section } from "@/shared/ui/parts";
import { ModuleTables } from "@/shared/ui/ModuleTables";

// 노드 탭의 패널 — 고르지 않으면 상태 집계와 까는 법, [노드 등록]이면 등록 폼, 고르면 노드 정보 · 키 · 기록.
export function NodesPanel() {
  const { ui } = useUi();
  const list = useQuery(nodesQuery()).data ?? [];
  if (ui.nodes.adding) return <AddNodePanel />;
  if (!ui.nodes.selected) return <SummaryPanel list={list} />;
  const n = list.find((x) => x.name === ui.nodes.selected);
  if (!n) return <><PanelHead title="수집 노드" /><div className="panel-body"><div className="empty">없는 노드입니다.</div></div></>;
  // key 로 노드마다 새로 그려 복사 버튼 글자 같은 상태가 다른 노드로 넘어가지 않게 합니다.
  return <NodePanel key={n.name} n={n} />;
}

function AddNodePanel() {
  const create = useCreateNode();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(String(new FormData(e.currentTarget).get("name") ?? "").trim());
  }
  return (
    <>
      <PanelHead title="노드 등록" />
      <div className="panel-body">
        <form id="node-form" className="form-grid" onSubmit={onSubmit}>
          <label className="wide"><span>노드 이름 <b>*</b></span><input id="node-name" name="name" required maxLength={64} pattern="[A-Za-z0-9._\-]+" placeholder="예: cust-db01" autoFocus /></label>
          <div className="wide form-actions"><PanelMsg /><button type="submit" className="primary">등록하고 키 발급</button></div>
        </form>
        <p className="note">서버 하나에 노드 하나. 이름은 영문 · 숫자 · . _ - 로 짓습니다.</p>
      </div>
    </>
  );
}

function SummaryPanel({ list }: { list: NodeRow[] }) {
  const count = (k: NodeStateClass) => list.filter((n) => nodeState(n)[0] === k).length;
  return (
    <>
      <PanelHead title="수집 노드" />
      <div className="panel-body">
        <Section icon="activity" title="상태">
          <KvTable rows={[["노드", `${list.length}대`], ["수집 중", `${count("on")}대`], ["끊김", `${count("stale")}대`], ["꺼짐 · 키 없음 · 기다리는 중", `${count("off") + count("wait")}대`]]} />
        </Section>
        <Section icon="server" title="노드 깔기">
          <p className="note">1. [노드 등록]으로 서버 이름을 넣고 키를 받습니다.<br />2. 그 서버에서 node/install.sh --server {location.origin} --key {"<키>"}</p>
        </Section>
      </div>
    </>
  );
}

function NodePanel({ n }: { n: NodeRow }) {
  const detail = useQuery(nodeQuery(n.name));
  const action = useNodeAction();
  const [cls, label, tip] = nodeState(n);

  const act = (a: NodeAct) => {
    if (a === "key" && !confirm(`${n.name} 의 키를 새로 발급합니다. 지금 키는 바로 못 쓰게 되어, 그 서버의 node.conf 를 새 키로 바꿔야 다시 보냅니다. 계속할까요?`)) return;
    action.mutate({ name: n.name, action: a });
  };

  const info: [string, ReactNode][] = ([
    ["호스트", n.host], ["IP", n.ip], ["수집 간격", n.interval_min ? `${n.interval_min}분` : ""], ["노드 버전", n.agent_version],
    ["등록", stamp(n.registered_at)], ["마지막 연락", stamp(n.last_seen_at)], ["마지막 수집", stamp(n.last_collected_at)],
  ] as [string, string | null][]).filter((row): row is [string, string] => !!row[1]);

  return (
    <>
      <PanelHead title="수집 노드" />
      <div className="panel-body">
        <p className="subject">{n.name}</p>
        <div className="rec-line"><span className={`nstate ${cls}`}>{label}</span></div>
        <div className="meta">{tip}</div>
        <Section icon="server" title="노드">
          <KvTable rows={info} />
          <div className="node-actions">
            <button className="rerun" onClick={() => act(n.enabled ? "off" : "on")}>{n.enabled ? "노드 끄기" : "노드 켜기"}</button>
            <button className="rerun" onClick={() => act("key")}>{n.key_issued ? "키 다시 발급" : "키 발급"}</button>
          </div>
          <PanelMsg />
        </Section>
        <NodeKey n={n} d={detail.data} />
        {detail.data ? <NodeRecords d={detail.data} />
          : detail.isError ? <p className="form-msg">{detail.error.message}</p>
            : <div className="empty">불러오는 중…</div>}
      </div>
    </>
  );
}

// 마지막 서버 점검(→ 검토 현황의 그 항목) · 최근 수집(달라진 설정) · 모듈 상태.
function NodeRecords({ d }: { d: NodeDetail }) {
  const { select } = useUi();
  const items = useQueue();
  const finding = d.findings?.[0];
  const item = finding && items.find((i) => i.itemKey === finding.key);
  return (
    <>
      <Section icon="activity" title="마지막 서버 점검">
        {finding ? (
          <>
            <div className="box"><LevelDot level={finding.level || "주의"} />{finding.failed ? "판정 실패" : finding.level} · {stamp(finding.created_at)}<br />{finding.summary}</div>
            {item && <button className="rerun" id="to-finding" onClick={() => select(item.key)}><Icon name="list" className="sm" />검토 현황에서 보기</button>}
          </>
        ) : <p className="note">{d.latest ? "다음 주기 점검을 기다리고 있습니다." : "아직 받은 수집이 없습니다."}</p>}
      </Section>
      <Section icon="list" title="최근 수집">
        {d.snapshots.length
          ? <KvTable rows={d.snapshots.map((x) => [stamp(x.collected_at), !x.changes.length ? "달라진 설정 없음"
            : x.changes.slice(0, 4).join(" · ") + (x.changes.length > 4 ? ` 외 ${x.changes.length - 4}개` : "")])} />
          : <p className="note">없음</p>}
      </Section>
      {d.latest && <ModuleTables snap={d.latest} />}
    </>
  );
}
