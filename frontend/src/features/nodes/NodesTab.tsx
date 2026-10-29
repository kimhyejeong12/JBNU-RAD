import { useQuery } from "@tanstack/react-query";
import { nodeState } from "./lib";
import { useJobs } from "@/app/data";
import { useUi } from "@/app/ui/UiContext";
import { useStartJob } from "@/shared/api/jobs";
import { nodesQuery } from "@/shared/api/queries";
import { stamp } from "@/shared/lib/format";
import { activateProps } from "@/shared/lib/hooks";
import { Icon } from "@/shared/ui/Icon";
import { LevelDot } from "@/shared/ui/parts";

// 수집 노드 — 서버마다 도는 node/sentinel_node 가 보낸 수집. 새 수집은 서버가 주기적으로 점검해 검토 현황에 올립니다.
// 탭에 들어올 때마다 마운트되어 목록을 다시 받습니다.
export function NodesTab() {
  const { ui, pickNode, addNode } = useUi();
  const nodes = useQuery(nodesQuery());
  const jobs = useJobs();
  const start = useStartJob();
  const list = nodes.data ?? [];
  // 노드 탭의 [지금 점검]도 같은 작업 큐를 씁니다. 다른 작업이 돌면 기다립니다.
  const checking = jobs?.running === "nodes";
  return (
    <section className="card nodes" id="view-nodes" role="tabpanel" aria-labelledby="tab-nodes">
      <div className="logs-head">
        <h3>수집 노드</h3>
        <span className="logs-count" id="node-count">{nodes.data ? `${list.length}대` : ""}</span>
        <button className="rerun run" id="check-now" disabled={!jobs || !!jobs.running || start.isPending} onClick={() => start.mutate("nodes")}>
          <Icon name="activity" className="sm" />
          <span id="check-now-txt">{checking ? `점검 중…${jobs?.total ? ` ${jobs.done}/${jobs.total}` : ""}` : "지금 점검"}</span>
        </button>
        <button className="rerun run" id="add-node" onClick={addNode}><Icon name="plus" className="sm" />노드 등록</button>
      </div>
      <div className="ltable-wrap">
        <table className="ltable">
          <thead><tr><th>노드</th><th>호스트</th><th>상태</th><th className="col-sol">마지막 수집</th><th>판정</th></tr></thead>
          <tbody id="node-rows">
            {nodes.isError ? <tr><td colSpan={5} className="empty">노드 목록을 받지 못했습니다: {nodes.error.message}</td></tr>
              : !nodes.data ? <tr><td colSpan={5} className="empty">불러오는 중…</td></tr>
                : !list.length ? <tr><td colSpan={5} className="empty">아직 등록된 노드가 없습니다.<br />[노드 등록]으로 서버마다 키를 발급하고, 그 서버에 node/install.sh 로 노드를 까세요.</td></tr>
                  : list.map((n) => {
                    const [cls, label, tip] = nodeState(n);
                    return (
                      <tr key={n.name} data-node={n.name} aria-current={n.name === ui.nodes.selected} {...activateProps(() => pickNode(n.name))}>
                        <td className="lwho">{n.name}</td>
                        <td>{n.host}{n.ip && n.ip !== n.host ? ` (${n.ip})` : ""}</td>
                        <td><span className={`nstate ${cls}`} data-tip={`${label}|${tip}`}>{label}</span></td>
                        <td className="col-sol when">{stamp(n.last_collected_at)}</td>
                        <td>{n.level ? <><LevelDot level={n.level} />{n.level}</> : <span className="note">{n.last_collected_at ? "점검 대기" : ""}</span>}</td>
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
