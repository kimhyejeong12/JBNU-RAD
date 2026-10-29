import { useQuery } from "@tanstack/react-query";
import { nodeState, nodeStateText, nodeStateTone } from "./lib";
import { useJobs } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { useStartJob } from "@/shared/api/jobs";
import { nodesQuery } from "@/shared/api/queries";
import { stamp } from "@/shared/lib/format";
import { activateProps } from "@/shared/lib/hooks";
import { Icon } from "@/shared/ui/base/Icon";
import { LevelDot } from "@/shared/ui/base/parts";
import { cn } from "@/shared/lib/cn";
import { card, cardCount, cardHead, cardTitle, lrowTone, ltable, ltableWrap, ltd, ltdEmpty, lth, note, toolButton } from "@/shared/ui/base/styles";

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
    <section className={cn(card, "flex min-h-[320px] flex-col")} id="view-nodes" role="tabpanel" aria-labelledby="tab-nodes">
      <div className={cardHead}>
        <h3 className={cardTitle}>수집 노드</h3>
        <span className={cardCount} id="node-count">{nodes.data ? `${list.length}대` : ""}</span>
        <button className={toolButton} id="check-now" disabled={!jobs || !!jobs.running || start.isPending} onClick={() => start.mutate("nodes")}>
          <Icon name="activity" small />
          <span id="check-now-txt">{checking ? `점검 중…${jobs?.total ? ` ${jobs.done}/${jobs.total}` : ""}` : "지금 점검"}</span>
        </button>
        <button className={toolButton} id="add-node" onClick={addNode}><Icon name="plus" small />노드 등록</button>
      </div>
      <div className={ltableWrap}>
        <table className={ltable}>
          <thead><tr><th className={lth}>노드</th><th className={lth}>호스트</th><th className={lth}>상태</th><th className={cn(lth, "narrow:hidden")}>마지막 수집</th><th className={lth}>판정</th></tr></thead>
          <tbody id="node-rows">
            {nodes.isError ? <tr className={lrowTone(false)}><td colSpan={5} className={ltdEmpty}>노드 목록을 받지 못했습니다: {nodes.error.message}</td></tr>
              : !nodes.data ? <tr className={lrowTone(false)}><td colSpan={5} className={ltdEmpty}>불러오는 중…</td></tr>
                : !list.length ? <tr className={lrowTone(false)}><td colSpan={5} className={ltdEmpty}>아직 등록된 노드가 없습니다.<br />[노드 등록]으로 서버마다 키를 발급하고, 그 서버에 node/install.sh 로 노드를 까세요.</td></tr>
                  : list.map((n) => {
                    const [cls, label, tip] = nodeState(n);
                    return (
                      <tr key={n.name} data-node={n.name} aria-current={n.name === ui.nodes.selected} className={lrowTone(n.name === ui.nodes.selected)} {...activateProps(() => pickNode(n.name))}>
                        <td className={cn(ltd, "whitespace-nowrap")}>{n.name}</td>
                        <td className={ltd}>{n.host}{n.ip && n.ip !== n.host ? ` (${n.ip})` : ""}</td>
                        <td className={ltd}><span className={cn(nodeStateText, nodeStateTone[cls])} data-tip={`${label}|${tip}`}>{label}</span></td>
                        <td className={cn(ltd, "whitespace-nowrap tabular-nums narrow:hidden")}>{stamp(n.last_collected_at)}</td>
                        <td className={ltd}>{n.level ? <><LevelDot level={n.level} />{n.level}</> : <span className={note}>{n.last_collected_at ? "점검 대기" : ""}</span>}</td>
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
