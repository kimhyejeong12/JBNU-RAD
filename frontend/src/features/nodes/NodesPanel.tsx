import type { FormEvent, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ask } from "@/app/ui/ask";
import { useQueue } from "@/app/queue/useQueue";
import { useUi } from "@/app/ui/state/UiContext";
import { Panel, PanelMsg } from "@/app/ui/panel/Panel";
import { nodeActions, nodeState, nodeStateText, nodeStateTone, type NodeStateClass, useCreateNode, useNodeAction, type NodeAct } from "./lib";
import { nodeQuery, nodesQuery } from "@/shared/api/queries";
import type { NodeDetail, NodeRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { KvTable, LevelDot, Section, ModuleTables, Subject } from "@/shared/ui/parts";
import { cn } from "@/shared/lib/cn";
import { formProblem } from "@/shared/lib/form";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { box, boxPre, empty, formGrid, formMsg, input, meta, note, recLine, toolButton, primaryAction, wideActions, wideField } from "@/shared/ui/styles";

export function NodesPanel() {
  const { ui } = useUi();
  const list = useQuery(nodesQuery()).data ?? [];
  if (ui.nodes.adding) return <AddNodePanel />;
  if (!ui.nodes.selected) return <SummaryPanel list={list} />;
  const n = list.find((x) => x.name === ui.nodes.selected);
  if (!n) return <Panel title="수집 노드"><div className={empty}>없는 노드입니다.</div></Panel>;
  // key 로 노드마다 새로 그려 복사 버튼 상태가 다른 노드로 넘어가지 않게 합니다.
  return <NodePanel key={n.name} n={n} />;
}

function AddNodePanel() {
  const create = useCreateNode();
  const { setPanelMsg } = useUi();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formProblem(e.currentTarget);
    if (problem) return setPanelMsg(problem);
    create.mutate(String(new FormData(e.currentTarget).get("name") ?? "").trim());
  }
  return (
    <Panel title="노드 등록">
      <form id="node-form" className={formGrid} noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <label className={wideField}><span>노드 이름 <b className="text-risk">*</b></span><input className={input} id="node-name" name="name" required maxLength={64} pattern="[A-Za-z0-9._\-]+" title="영문, 숫자, . _ -" placeholder="예: cust-db01" autoFocus /></label>
        <div className={wideActions}><PanelMsg /><button type="submit" className={primaryAction}>등록하고 키 발급</button></div>
      </form>
    </Panel>
  );
}

function SummaryPanel({ list }: { list: NodeRow[] }) {
  const count = (k: NodeStateClass) => list.filter((n) => nodeState(n)[0] === k).length;
  return (
    <Panel title="수집 노드">
      <Section icon="activity" title="상태">
        <KvTable rows={[["노드", `${list.length}대`], ["수집 중", `${count("on")}대`], ["끊김", `${count("stale")}대`], ["꺼짐", `${count("off") + count("wait")}대`]]} />
      </Section>
      <Section icon="server" title="노드 깔기">
        <div className={boxPre}>node/install.sh --server {location.origin} --key {"<키>"}</div>
      </Section>
    </Panel>
  );
}

function NodePanel({ n }: { n: NodeRow }) {
  const detail = useQuery(nodeQuery(n.name));
  const action = useNodeAction();
  const [cls, label, tip] = nodeState(n);

  // 감시가 멈추는 끄기 · 수집이 끊기는 키 다시 발급만 묻습니다.
  const act = async (a: NodeAct) => {
    const q = a === "off"
      ? { title: "노드 끄기", confirm: "끄기", danger: true, message: `${n.name} 노드를 끕니다. 이 서버가 보내는 수집을 받지 않고 주기 점검에서도 빠져, 이 서버의 감시가 멈춥니다.` }
      : a === "key" && n.key_issued
        ? { title: "키 다시 발급", confirm: "다시 발급", danger: true, message: `${n.name} 의 키를 새로 발급합니다. 지금 키는 바로 못 쓰게 되어, 그 서버의 node.conf 를 새 키로 바꿔야 다시 보냅니다.` }
        : null;
    if (q && !(await ask(q))) return;
    action.mutate({ name: n.name, action: a });
  };

  const info: [string, ReactNode][] = ([
    ["호스트", n.host], ["IP", n.ip], ["수집 간격", n.interval_min ? `${n.interval_min}분` : ""], ["노드 버전", n.agent_version],
    ["등록", stamp(n.registered_at)], ["마지막 연락", stamp(n.last_seen_at)], ["마지막 수집", stamp(n.last_collected_at)],
  ] as [string, string | null][]).filter((row): row is [string, string] => !!row[1]);

  return (
    <Panel title="수집 노드">
      <Subject title={n.name} />
      <div className={recLine}><span className={cn(nodeStateText, nodeStateTone[cls])}>{label}</span></div>
      <div className={meta}>{tip}</div>
      <Section icon="server" title="노드">
        <KvTable rows={info} />
        <div className={nodeActions}>
          <button className={toolButton} onClick={() => act(n.enabled ? "off" : "on")}>{n.enabled ? "노드 끄기" : "노드 켜기"}</button>
          <button className={toolButton} onClick={() => act("key")}>{n.key_issued ? "키 다시 발급" : "키 발급"}</button>
        </div>
        <PanelMsg />
      </Section>
      <NodeKey n={n} d={detail.data} />
      {detail.data ? <NodeRecords d={detail.data} />
        : detail.isError ? <p className={cn(formMsg, "my-[1em]")}>{detail.error.message}</p>
          : <div className={empty}>불러오는 중…</div>}
    </Panel>
  );
}

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
            <div className={box}><LevelDot level={finding.level || "주의"} />{finding.failed ? "판정 실패" : finding.level} <span className="text-ink-dim">{stamp(finding.created_at)}</span><br />{finding.summary}</div>
            {item && <button className={toolButton} id="to-finding" onClick={() => select(item.key)}><Icon name="list" small />검토 현황에서 보기</button>}
          </>
        ) : <p className={note}>{d.latest ? "점검 대기" : "수집 없음"}</p>}
      </Section>
      <Section icon="list" title="최근 수집">
        {d.snapshots.length
          ? <KvTable rows={d.snapshots.map((x) => [stamp(x.collected_at), !x.changes.length ? "달라진 설정 없음"
            : x.changes.slice(0, 4).join(", ") + (x.changes.length > 4 ? ` 외 ${x.changes.length - 4}개` : "")])} />
          : <p className={note}>없음</p>}
      </Section>
      {d.latest && <ModuleTables snap={d.latest} />}
    </>
  );
}

// 내부망 서비스라 노드 키를 언제든 다시 보여줍니다.
export function NodeKey({ n, d }: { n: NodeRow; d?: NodeDetail }) {
  const input = useRef<HTMLInputElement>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  if (!d || !n.key_issued) return null;
  if (!d.key) return <Section icon="lock" title="노드 키"><p className={note}>볼 수 없는 키입니다. [키 다시 발급]을 누르세요.</p></Section>;
  const cmd = `sudo sh node/install.sh --server ${location.origin} --key ${d.key}`;

  // 사내망 http 화면에서는 클립보드 API 를 못 쓸 수 있어 키 칸을 골라 둡니다.
  async function copy(which: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setLabels((l) => ({ ...l, [which]: "복사했습니다" }));
    } catch {
      input.current?.focus();
      input.current?.select();
      setLabels((l) => ({ ...l, [which]: "Ctrl+C 로 복사하세요" }));
    }
  }

  return (
    <Section icon="lock" title="노드 키">
      <div className="rounded-lg border border-line p-3">
        {/* font 축약형이 굵기 · 줄 높이도 normal 로 되돌리던 것과 같게 */}
        <input id="issued-key" ref={input} readOnly value={d.key} aria-label="노드 키"
          className="w-full rounded-md border border-line bg-surface px-2 py-1.75 text-[12.5px] font-normal text-black font-[ui-monospace,monospace] leading-[normal]" />
        <div className={boxPre}>{cmd}</div>
        <div className={cn(nodeActions, "mt-2")}>
          <button className={toolButton} onClick={() => copy("key", d.key!)}>{labels.key ?? "키 복사"}</button>
          <button className={toolButton} onClick={() => copy("cmd", cmd)}>{labels.cmd ?? "설치 명령 복사"}</button>
        </div>
      </div>
    </Section>
  );
}
