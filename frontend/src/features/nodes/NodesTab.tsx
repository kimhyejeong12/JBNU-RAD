import { useQuery } from "@tanstack/react-query";
import { nodeState, nodeStateText, nodeStateTone } from "./lib";
import { useJobs } from "@/app/session/data";
import { useUi } from "@/app/ui/state/UiContext";
import { JobReset } from "@/app/ui/jobs/JobReset";
import { useStartJob } from "@/shared/api/jobs";
import { nodesQuery } from "@/shared/api/queries";
import { stamp } from "@/shared/lib/format";
import { activateProps } from "@/shared/lib/hooks";
import { Icon } from "@/shared/ui/base/Icon";
import { LevelDot } from "@/shared/ui/base/parts";
import { cn } from "@/shared/lib/cn";
import { card, cardCount, cardHead, cardTitle, lrowTone, ltable, ltableWrap, ltd, ltdEmpty, lth, note, toolButton } from "@/shared/ui/base/styles";

export function NodesTab() {
  const { ui, pickNode, addNode, dispatch } = useUi();
  const onPick = (name: string) => (name === ui.nodes.selected ? dispatch({ type: "PICK_NODE", name: null }) : pickNode(name));
  const nodes = useQuery(nodesQuery());
  const jobs = useJobs();
  const start = useStartJob();
  const list = nodes.data ?? [];
  const checking = jobs?.running === "nodes";
  return (
    <section className={cn(card, "flex min-h-80 flex-col")} id="view-nodes" role="tabpanel" aria-labelledby="tab-nodes">
      <div className={cardHead}>
        <h3 className={cardTitle}>수집 노드</h3>
        {/* 건수와 버튼이 둘 다 오른쪽으로 밀면 버튼이 가운데로 떠서 버튼만 오른쪽 끝에 둡니다. */}
        <span className={cn(cardCount, "ml-0")} id="node-count">{nodes.data ? `${list.length}대` : ""}</span>
        <button className={toolButton} id="check-now" disabled={!jobs || !!jobs.running || start.isPending} onClick={() => start.mutate("nodes")}>
          <Icon name="activity" small />
          <span id="check-now-txt">{checking ? `점검 중…${jobs?.total ? ` ${jobs.done}/${jobs.total}` : ""}` : "지금 점검"}</span>
        </button>
        <JobReset />
        <button className={cn(toolButton, "ml-0")} id="add-node" onClick={addNode}><Icon name="plus" small />노드 등록</button>
      </div>
      <div className={ltableWrap}>
        <table className={ltable}>
          <thead><tr><th className={lth}>노드</th><th className={lth}>호스트</th><th className={lth}>상태</th><th className={cn(lth, "narrow:hidden")}>마지막 수집</th><th className={lth}>판정</th></tr></thead>
          <tbody id="node-rows">
            {nodes.isError ? <tr className={lrowTone(false)}><td colSpan={5} className={ltdEmpty}>노드 목록을 받지 못했습니다: {nodes.error.message}</td></tr>
              : !nodes.data ? <tr className={lrowTone(false)}><td colSpan={5} className={ltdEmpty}>불러오는 중…</td></tr>
                : !list.length ? <tr className={lrowTone(false)}><td colSpan={5} className={ltdEmpty}>등록된 노드가 없습니다.</td></tr>
                  : list.map((n) => {
                    const [cls, label, tip] = nodeState(n);
                    return (
                      <tr key={n.name} data-node={n.name} aria-current={n.name === ui.nodes.selected} className={lrowTone(n.name === ui.nodes.selected)} {...activateProps(() => onPick(n.name))}>
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
