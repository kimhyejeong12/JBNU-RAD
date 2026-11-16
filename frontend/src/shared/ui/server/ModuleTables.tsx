import { Fragment } from "react";
import { KvTable, Section } from "@/shared/ui/base/parts";
import { boxPre, note } from "@/shared/ui/base/styles";
// 판정할 때 본 수집(SnapshotState)과 노드의 수집(Snapshot) 둘 다 받습니다 — 앞의 것이 칸이 다 선택이라 뒤의 것도 맞습니다.
import type { SnapshotState } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { MODULE_LABEL } from "@/shared/lib/labels";

export function ModuleState({ snap }: { snap?: SnapshotState | null }) {
  if (!snap?.modules) return null;
  return (
    <>
      <ModuleChanges snap={snap} />
      <ModuleTables snap={snap} />
    </>
  );
}

export function ModuleChanges({ snap }: { snap: SnapshotState }) {
  return (
    <Section icon="activity" title="직전 수집과 달라진 설정">
      {snap.changes?.length ? <div className={boxPre}>{snap.changes.join("\n")}</div> : <p className={note}>바뀐 설정 없음</p>}
    </Section>
  );
}

export function ModuleTables({ snap }: { snap: SnapshotState }) {
  return (
    <Section icon="db" title="모듈 상태">
      <p className={note}>{stamp(snap.collected_at)} 수집</p>
      {Object.entries(snap.modules ?? {}).map(([m, facts]) => (
        <Fragment key={m}>
          <p className="mx-0 mt-2.5 mb-1 text-[12px] font-bold text-ink-dim">{MODULE_LABEL[m] || m}</p>
          <KvTable rows={Object.entries(facts)} />
        </Fragment>
      ))}
    </Section>
  );
}
