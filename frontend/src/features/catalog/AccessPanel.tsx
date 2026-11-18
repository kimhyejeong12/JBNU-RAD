import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateAccess, useUpdateAccess } from "./api";
import { accessState } from "./lib";
import { useRequests } from "@/app/session/data";
import { Panel, PanelFoot, PanelMsg, RecentChange, type PanelMode, type PanelRecord } from "@/app/ui/panel/Panel";
import { catalogQuery } from "@/shared/api/queries";
import type { AccessItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { isActive } from "@/shared/lib/request";
import { cn } from "@/shared/lib/cn";
import { useUi } from "@/app/ui/state/UiContext";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { actionButton, field, formActions, goodButton, input, panelFormGrid, primaryAction, rowInput, wideActions, wideField } from "@/shared/ui/styles";
import { Icon } from "@/shared/ui/Icon";
import { GroupBox, InfoRow, Pill, Switch, Subject } from "@/shared/ui/parts";
import { ask } from "@/app/ui/ask";
import { checkForm } from "@/shared/lib/form";


const Fields = ({ v }: { v?: AccessItem }) => (
  <>
    <label className={field}>이름<input className={input} name="name" required maxLength={100} defaultValue={v?.name ?? ""} placeholder="예: 급여 테이블 조회" /></label>
    <label className={field}>시스템<input className={input} name="system" maxLength={100} defaultValue={v?.system ?? ""} placeholder="예: 인사 시스템" /></label>
    <label className={wideField}>분류<input className={input} name="category" maxLength={100} defaultValue={v?.category ?? ""} placeholder="예: 급여정보" /></label>
    <label className={wideField}>설명<textarea className={input} name="description" rows={3} maxLength={2000} defaultValue={v?.description ?? ""} placeholder="이 권한으로 할 수 있는 일" /></label>
  </>
);

// 지난 신청이 코드를 가리키므로 코드는 못 바꾸고, 지우지 않고 끔
export function AccessPanel({ a }: { a: AccessItem | null }) {
  return a ? <EditAccess a={a} /> : <NewAccess />;
}

function NewAccess() {
  const create = useCreateAccess();
  const { setPanelMsg } = useUi();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const f = checkForm(e, setPanelMsg);
    if (!f) return;
    create.mutate(Object.fromEntries(f));
  }
  return (
    <Panel title="권한 등록">
    {/* 패널 높이를 채우는 격자라 줄이 벌어지지 않게 위에서부터 쌓음(content-start) */}
    <form className={panelFormGrid} id="access-form" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
      <label className={field}>코드 (변경 불가)<input className={input} name="code" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" title="영문, 숫자, _ . -" autoComplete="off" placeholder="예: HR_SALARY_READ" /></label>
      <Fields />
      <div className={wideActions}><PanelMsg /><button type="submit" className={primaryAction}>등록</button></div>
    </form>
    </Panel>
  );
}

function EditAccess({ a }: { a: AccessItem }) {
  const update = useUpdateAccess();
  const { setPanelMsg } = useUi();
  const requests = useRequests();
  // 폼이 uncontrolled 라 저장 뒤 서버 값으로 다시 그림
  const formKey = `${a.code}:${useQuery(catalogQuery()).dataUpdatedAt}`;
  const used = requests.filter((r) => r.access_code === a.code);
  const active = used.filter((r) => isActive(r)).length;
  // 계정 패널과 같음 — 보기에서 [수정]을 눌러 고치고, 신청 가능 여부도 [저장] 때 함께 반영함
  const [mode, setMode] = useState<PanelMode>("view");
  const [open, setOpen] = useState(a.is_active);
  const editing = mode === "edit";
  const record: PanelRecord = {
    mode, editable: true, audit: { type: "access", id: a.code, rev: formKey },
    setMode: (m) => { if (m === "edit") setOpen(a.is_active); setMode(m); },
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    const f = checkForm(e, setPanelMsg);
    if (!f) return;
    // 막으면 새 신청이 바로 막혀서 막을 때만 물음
    if (a.is_active && !open && !(await ask({
      title: "신청 막기", confirm: "막기", danger: true,
      message: `${a.name} 권한의 새 신청을 막습니다.`,
    }))) return;
    const patch = { name: f.get("name"), system: f.get("system"), category: f.get("category"), description: f.get("description"), is_active: open };
    update.mutate({ code: a.code, patch }, { onSuccess: () => setMode("view") });
  }

  // 권한 정보(시스템 · 분류 · 설명)는 신청 판정의 입력에 들어감 (sources/people.py)
  return (
    <Panel title="권한 상세 정보" record={record} foot={<PanelFoot />}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Subject title={<>{a.name} ({a.code})</>} className="mb-0" info={[`신청 ${used.length}건`, `유효 ${active}건`]} />
        </div>
        <Pill tone={a.is_active ? goodButton : "border-line text-ink-dim"} className="gap-1 py-1">
          <Icon name={a.is_active ? "check" : "close"} small />{accessState(a.is_active)}
        </Pill>
      </div>
      {mode === "view" && <RecentChange record={record} />}
      <form key={formKey} id="access-edit" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <GroupBox icon="key" title="권한 정보" className="mt-3">
          {editing && <InfoRow icon="key" label="이름"><input className={rowInput} name="name" aria-label="이름" required maxLength={100} defaultValue={a.name} /></InfoRow>}
          <InfoRow icon="server" label="시스템">
            {editing ? <input className={rowInput} name="system" aria-label="시스템" maxLength={100} defaultValue={a.system} placeholder="예: 인사 시스템" /> : a.system || "없음"}
          </InfoRow>
          <InfoRow icon="list" label="분류">
            {editing ? <input className={rowInput} name="category" aria-label="분류" maxLength={100} defaultValue={a.category} placeholder="예: 급여정보" /> : a.category || "없음"}
          </InfoRow>
          <InfoRow icon="file" label="설명">
            {editing
              ? <textarea className={rowInput} name="description" aria-label="설명" rows={3} maxLength={2000} defaultValue={a.description} placeholder="이 권한으로 할 수 있는 일" />
              : <span className="whitespace-pre-line">{a.description || "없음"}</span>}
          </InfoRow>
        </GroupBox>
        <GroupBox icon="gear" title="신청 설정" className="mt-3">
          <InfoRow icon="check" label="상태">
            {editing ? <Switch checked={open} onChange={setOpen} label={accessState(open)} /> : accessState(a.is_active)}
          </InfoRow>
          <InfoRow icon="calendar" label="등록일"><span className="tabular-nums">{stamp(a.created_at)}</span></InfoRow>
        </GroupBox>
        {editing && (
          <div className={cn(formActions, "mt-3")}>
            <button type="button" className={actionButton} onClick={() => setMode("view")}>취소</button>
            <button type="submit" className={primaryAction}>저장</button>
          </div>
        )}
      </form>
    </Panel>
  );
}
