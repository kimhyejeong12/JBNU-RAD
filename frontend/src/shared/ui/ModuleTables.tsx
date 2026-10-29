import { Fragment } from "react";
import { KvTable, Section } from "./parts";
import type { Snapshot } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { MODULE_LABEL } from "@/shared/lib/labels";

// 수집 노드가 읽어 온 모듈 상태. 직전 수집과 달라진 설정을 먼저 보여줍니다.
export function ModuleState({ snap }: { snap?: Snapshot | null }) {
  if (!snap?.modules) return null;
  return (
    <>
      <Section icon="activity" title="직전 수집과 달라진 설정">
        {snap.changes?.length ? <div className="box pre">{snap.changes.join("\n")}</div> : <p className="note">직전 수집과 달라진 설정이 없습니다.</p>}
      </Section>
      <ModuleTables snap={snap} />
    </>
  );
}

export function ModuleTables({ snap }: { snap: Snapshot }) {
  return (
    <Section icon="db" title="모듈 상태">
      <p className="note">{stamp(snap.collected_at)} 수집 · {snap.collected_by || "수집 계정 모름"}</p>
      {Object.entries(snap.modules ?? {}).map(([m, facts]) => (
        <Fragment key={m}>
          <p className="mod-name">{MODULE_LABEL[m] || m}</p>
          <KvTable rows={Object.entries(facts)} />
        </Fragment>
      ))}
    </Section>
  );
}
