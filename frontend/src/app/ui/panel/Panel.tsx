import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUi } from "@/app/ui/state/UiContext";
import { panelOnDemand } from "@/app/ui/state/uiReducer";
import { cn } from "@/shared/lib/cn";
import { actionButton, card, formActions, goodButton, note, panelBody, panelFoot, cardTitle, msgTone, primaryAction, toolButton } from "@/shared/ui/styles";
import { auditQuery } from "@/shared/api/queries";
import type { AuditTarget } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { AUDIT_ACTION, changeSummary, changeText } from "@/shared/lib/labels";
import { History, Pill, Subject } from "@/shared/ui/parts";
import { Icon } from "@/shared/ui/Icon";

export type PanelMode = "view" | "edit" | "history";
// 설정 패널(계정 · 권한) — 보기에서 [수정]을 눌러 고치고, 최근 변경 줄을 눌러 이력을 봄
export interface PanelRecord {
  mode: PanelMode;
  setMode: (m: PanelMode) => void;
  editable: boolean;
  audit: { type: AuditTarget; id: string; rev: string | number };
}

// 오른쪽 패널 틀 — 머리 상자(제목 · 버튼) 하나, 내용과 아래 칸(foot)을 묶은 상자 하나. 모든 패널이 씀
export function Panel({ title, actions, record, foot, children }: { title: ReactNode; actions?: ReactNode; record?: PanelRecord; foot?: ReactNode; children: ReactNode }) {
  const history = record?.mode === "history" ? record : null;
  const head = history
    ? <button type="button" className="flex items-center gap-1 border-none bg-transparent p-0 font-[inherit] hover:text-ink-soft" onClick={() => history.setMode("view")}><Icon name="back" small />변경 이력</button>
    : title;
  return (
    <>
      <PanelHead title={head} record={record}>{actions}</PanelHead>
      <div className={cn(card, "mt-3 flex min-h-0 flex-1 flex-col overflow-hidden")}>
        <div className={panelBody}>{history ? <AuditList {...history.audit} /> : children}</div>
        {foot}
      </div>
    </>
  );
}

const closeX = "border-none bg-transparent px-1 py-0 text-[22px] leading-none text-ink-dim hover:text-ink";

function PanelHead({ title, record, children }: { title: ReactNode; record?: PanelRecord; children?: ReactNode }) {
  const { closePanel, ui } = useUi();
  const onDemand = panelOnDemand(ui.mainTab);
  const tools = children ?? (record?.mode === "view" && record.editable
    ? <button type="button" className={toolButton} onClick={() => record.setMode("edit")}><Icon name="pencil" small />수정</button>
    : null);
  return (
    // 높이를 정해 두어 버튼이 있는 머리와 없는 머리가 같음
    <div className={cn(card, "flex h-12 flex-none items-center gap-2.5 px-4.5")}>
      <h3 className={cardTitle}>{title}</h3>
      {tools}
      {/* 수정 중 넓은 화면의 × — 좁은 화면은 패널 닫기 ×가 같은 자리에 있어 그것으로 취소함 */}
      {record?.mode === "edit" && !onDemand && (
        <button type="button" aria-label="수정 취소" onClick={() => record.setMode("view")} className={cn(closeX, "ml-auto narrow:hidden")}>×</button>
      )}
      <button aria-label="닫기" onClick={closePanel}
        className={cn("hidden narrow:block", closeX, onDemand && "block", tools ? "ml-1" : "ml-auto")}>
        ×
      </button>
    </div>
  );
}

// "✓" 로 시작하면 완료(초록), 아니면 오류임
export function PanelMsg() {
  const { ui } = useUi();
  if (!ui.panelMsg) return null;
  return <p className={cn(msgTone(ui.panelMsg), "my-[1em]")}>{ui.panelMsg}</p>;
}

export function PanelFoot({ note: text }: { note?: ReactNode }) {
  const { ui } = useUi();
  if (!ui.panelMsg && !text) return null;
  return <div className={panelFoot}>{ui.panelMsg ? <PanelMsg /> : <p className={note}>{text}</p>}</div>;
}

// 감사 기록에서 읽은 한 대상의 변경 이력임 — 판정의 근거가 언제 누구 손으로 바뀌었는지 보임
function AuditList({ type, id, rev }: PanelRecord["audit"]) {
  const q = useQuery(auditQuery(type, id, rev));
  const rows = q.data ?? [];
  return rows.length
    ? <History steps={rows.map((r) => ({ title: AUDIT_ACTION[r.action] ?? r.action, who: r.by, when: stamp(r.at), say: changeText(r) }))} />
    : <p className={note}>{q.isLoading ? "읽는 중…" : q.isError ? q.error.message : "기록 없음"}</p>;
}

// 설정 패널(계정 · 권한 · 기준 문서) 머리 — 이름, 정보 한 줄, 오른쪽 상태 배지, 보기에서는 최근 변경 줄
export function RecordHead({ record, title, info, state }: { record: PanelRecord; title: ReactNode; info: ReactNode[]; state?: { on: boolean; text: string } }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1"><Subject title={title} className="mb-0" info={info} /></div>
        {state && (
          <Pill tone={state.on ? goodButton : "border-line text-ink-dim"} className="gap-1 py-1">
            <Icon name={state.on ? "check" : "close"} small />{state.text}
          </Pill>
        )}
      </div>
      {record.mode === "view" && <RecentChange record={record} />}
    </>
  );
}

// 수정 화면 아래 [취소] [저장] — busy 면 저장 자리에 진행 글. left 는 왼쪽 끝 버튼(문서 지우기)
export function EditActions({ onCancel, busy, left }: { onCancel: () => void; busy?: string | false; left?: ReactNode }) {
  return (
    <div className={cn(formActions, "mt-3")}>
      {left}
      <button type="button" className={actionButton} onClick={onCancel}>취소</button>
      <button type="submit" className={primaryAction} disabled={!!busy}>{busy || "저장"}</button>
    </div>
  );
}

// 보기 화면 위 한 줄 — 마지막으로 누가 무엇을 바꿨는지. 누르면 이력 전체(같은 질의라 한 번만 받음)
function RecentChange({ record }: { record: PanelRecord }) {
  const { type, id, rev } = record.audit;
  const rows = useQuery(auditQuery(type, id, rev)).data;
  if (!rows) return null;
  const last = rows[0];
  if (!last) return <p className={cn(note, "mt-2.5 flex items-center gap-1.5")}><Icon name="clock" small />변경 기록 없음</p>;
  return (
    <button type="button" onClick={() => record.setMode("history")}
      className="mt-2.5 flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.75 text-left text-[12.5px] hover:border-ink-dim">
      <Icon name="clock" small />
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
        <b className="font-semibold">최근 변경</b>
        <span className="text-ink-dim tabular-nums">{stamp(last.at)}</span>
        <span>{last.by}</span>
        <span className="truncate text-ink-soft">{changeSummary(last)}</span>
      </span>
      <span className="flex flex-none items-center text-ink-dim">이력 {rows.length}<Icon name="chev" small /></span>
    </button>
  );
}
