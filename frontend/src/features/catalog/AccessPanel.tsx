import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateAccess, useUpdateAccess } from "./api";
import { useRequests } from "@/app/session/data";
import { PanelHead, PanelFoot, PanelMsg } from "@/app/ui/panel/Panel";
import { catalogQuery } from "@/shared/api/queries";
import type { AccessItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { isActive } from "@/shared/lib/request";
import { cn } from "@/shared/lib/cn";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { actionButton, field, formActions, formGrid, input, meta, panelBody, primaryButton, subject } from "@/shared/ui/base/styles";
import { Switch } from "@/shared/ui/base/parts";
import { ask } from "@/app/ui/ask";

// 두 칸을 다 쓰는 칸 · 버튼 줄.
const WIDE_FIELD = cn(field, "col-span-full");
const WIDE_ACTIONS = cn(formActions, "col-span-full");

const Fields = ({ v }: { v?: AccessItem }) => (
  <>
    <label className={field}>이름<input className={input} name="name" required maxLength={100} defaultValue={v?.name ?? ""} placeholder="예: 급여 테이블 조회" /></label>
    <label className={field}>시스템<input className={input} name="system" maxLength={100} defaultValue={v?.system ?? ""} placeholder="예: 인사 시스템" /></label>
    <label className={field}>분류<input className={input} name="category" maxLength={100} defaultValue={v?.category ?? ""} placeholder="예: 급여정보 · 인사정보 · 관리자" /></label>
    <label className={WIDE_FIELD}>설명 (AI 판정에도 함께 넘깁니다)<textarea className={input} name="description" rows={2} maxLength={2000} defaultValue={v?.description ?? ""} placeholder="무엇을 할 수 있는 권한인지" /></label>
  </>
);

// 권한 목록 패널 (보안 총책임자) — 선택 없음 = 권한 등록. 지난 신청이 코드를 가리키므로 코드는 못 바꾸고, 지우지 않고 끕니다.
export function AccessPanel({ a }: { a: AccessItem | null }) {
  return a ? <EditAccess a={a} /> : <NewAccess />;
}

function NewAccess() {
  const create = useCreateAccess();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  }
  return (
    <>
      <PanelHead title="권한 등록" />
      <form className={cn(panelBody, formGrid, "px-4.5 py-4")} id="access-form" onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <label className={field}>코드 (바꿀 수 없음)<input className={input} name="code" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" autoComplete="off" placeholder="예: HR_SALARY_READ" /></label>
        <Fields />
        <div className={WIDE_ACTIONS}><PanelMsg /><button type="submit" className={cn(actionButton, primaryButton)}>등록</button></div>
      </form>
    </>
  );
}

function EditAccess({ a }: { a: AccessItem }) {
  const update = useUpdateAccess();
  const requests = useRequests();
  // 저장 뒤 서버 값으로 다시 그립니다 (폼은 uncontrolled).
  const formKey = `${a.code}:${useQuery(catalogQuery()).dataUpdatedAt}`;
  const used = requests.filter((r) => r.access_code === a.code);
  const active = used.filter((r) => isActive(r)).length;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    update.mutate({ code: a.code, patch: { name: f.get("name"), system: f.get("system"), category: f.get("category"), description: f.get("description") } });
  }
  // 켜고 끄기는 저장과 따로 바로 적용합니다. 바꾸기 전에 한 번 묻습니다.
  async function onToggle(on: boolean) {
    const what = `${a.name} (${a.code}) 권한을`;
    const ok = await ask(on
      ? { title: "권한 켜기", confirm: "켜기", message: `${what} 켭니다. 일반 사용자가 다시 신청할 수 있습니다.` }
      : { title: "권한 끄기", confirm: "끄기", danger: true, message: `${what} 끕니다. 새 신청만 막고, 이미 받은 권한 · 결재 중인 신청은 그대로입니다.` });
    if (ok) update.mutate({ code: a.code, patch: { is_active: on }, done: on ? "✓ 켰습니다" : "✓ 껐습니다" });
  }

  return (
    <>
      <PanelHead title="권한" />
      <div className={panelBody}>
        <p className={subject}>{a.name} ({a.code})</p>
        <div className={meta}>신청 {used.length}건 · 유효 {active}건 · 등록 {stamp(a.created_at)}</div>
        <Switch className="mt-3.5" checked={a.is_active} disabled={update.isPending} onChange={onToggle}
          label={a.is_active ? "켜짐" : "꺼짐"}
          hint={a.is_active ? "일반 사용자가 신청할 수 있습니다. 끄면 새 신청만 막고, 이미 받은 권한 · 결재 중인 신청은 그대로" : "새로 신청할 수 없습니다. 켜면 다시 신청할 수 있습니다"} />
        <form key={formKey} className={cn(formGrid, "px-0 pt-3 pb-0")} id="access-edit" onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
          <Fields v={a} />
          <div className={WIDE_ACTIONS}><button type="submit" className={cn(actionButton, primaryButton)}>저장</button></div>
        </form>
      </div>
      <PanelFoot note="이름을 바꿔도 이미 낸 신청에는 신청 때 이름이 남습니다." />
    </>
  );
}
