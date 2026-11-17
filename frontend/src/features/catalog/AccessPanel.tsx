import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateAccess, useUpdateAccess } from "./api";
import { accessState } from "./lib";
import { useRequests } from "@/app/session/data";
import { ChangeLog, Panel, PanelFoot, PanelMsg } from "@/app/ui/panel/Panel";
import { catalogQuery } from "@/shared/api/queries";
import type { AccessItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { isActive } from "@/shared/lib/request";
import { cn } from "@/shared/lib/cn";
import { useUi } from "@/app/ui/state/UiContext";
import { formProblem } from "@/shared/lib/form";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { box, field, formActions, input, meta, subject, fieldGrid, panelFormGrid, primaryAction, wideActions, wideField } from "@/shared/ui/styles";
import { GroupBox, Meta, Switch } from "@/shared/ui/parts";
import { ask } from "@/app/ui/ask";


const Fields = ({ v }: { v?: AccessItem }) => (
  <>
    <label className={field}>이름<input className={input} name="name" required maxLength={100} defaultValue={v?.name ?? ""} placeholder="예: 급여 테이블 조회" /></label>
    <label className={field}>시스템<input className={input} name="system" maxLength={100} defaultValue={v?.system ?? ""} placeholder="예: 인사 시스템" /></label>
    <label className={wideField}>분류<input className={input} name="category" maxLength={100} defaultValue={v?.category ?? ""} placeholder="예: 급여정보" /></label>
    <label className={wideField}>설명<textarea className={input} name="description" rows={3} maxLength={2000} defaultValue={v?.description ?? ""} placeholder="무엇을 할 수 있는 권한인지" /></label>
  </>
);

// 지난 신청이 코드를 가리키므로 코드는 못 바꾸고, 지우지 않고 끕니다.
export function AccessPanel({ a }: { a: AccessItem | null }) {
  return a ? <EditAccess a={a} /> : <NewAccess />;
}

function NewAccess() {
  const create = useCreateAccess();
  const { setPanelMsg } = useUi();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formProblem(e.currentTarget);
    if (problem) return setPanelMsg(problem);
    create.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  }
  return (
    <Panel title="권한 등록">
    {/* 패널 높이를 채우는 격자라 줄이 벌어지지 않게 위에서부터 쌓습니다(content-start). */}
    <form className={panelFormGrid} id="access-form" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
      <label className={field}>코드 (바꿀 수 없음)<input className={input} name="code" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" title="영문, 숫자, _ . -" autoComplete="off" placeholder="예: HR_SALARY_READ" /></label>
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
  // 폼이 uncontrolled 라 저장 뒤 서버 값으로 다시 그립니다.
  const formKey = `${a.code}:${useQuery(catalogQuery()).dataUpdatedAt}`;
  const used = requests.filter((r) => r.access_code === a.code);
  const active = used.filter((r) => isActive(r)).length;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formProblem(e.currentTarget);
    if (problem) return setPanelMsg(problem);
    const f = new FormData(e.currentTarget);
    update.mutate({ code: a.code, patch: { name: f.get("name"), system: f.get("system"), category: f.get("category"), description: f.get("description") } });
  }
  // 끄면 새 신청이 바로 막혀서 끌 때만 묻습니다.
  async function onToggle(on: boolean) {
    if (!on && !(await ask({
      title: "신청 막기", confirm: "막기", danger: true,
      message: `${a.name} 권한의 새 신청을 막습니다.`,
    }))) return;
    update.mutate({ code: a.code, patch: { is_active: on }, done: on ? "✓ 신청을 열었습니다" : "✓ 신청을 막았습니다" });
  }

  return (
    <Panel title="권한" foot={<PanelFoot />}>
      <p className={subject}>{a.name} ({a.code})</p>
      <div className={meta}><Meta items={[`신청 ${used.length}건`, `유효 ${active}건`, `등록 ${stamp(a.created_at)}`]} /></div>
      <div className={cn(box, "mt-3.5")}>
        <Switch checked={a.is_active} disabled={update.isPending} onChange={onToggle} label={accessState(a.is_active)} />
      </div>
      {/* 시스템 · 분류 · 설명은 신청 판정의 입력에 들어갑니다 (sources/people.py). */}
      <form key={formKey} id="access-edit" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <GroupBox icon="key" title="권한 정보 (AI 판정 근거)">
          <div className={fieldGrid}><Fields v={a} /></div>
        </GroupBox>
        <div className={cn(formActions, "mt-3")}><button type="submit" className={primaryAction}>저장</button></div>
      </form>
      <ChangeLog type="access" id={a.code} rev={formKey} />
    </Panel>
  );
}
