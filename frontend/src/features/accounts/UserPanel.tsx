import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateUser, useUserAction } from "./api";
import { useMe } from "@/app/session/me";
import { PanelHead, PanelFoot, PanelMsg } from "@/app/ui/panel/Panel";
import { usersQuery } from "@/shared/api/queries";
import type { Role, UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { ROLE_LABEL } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { actionButton, field, formActions, formGrid, input, meta, panelBody, primaryButton, subject } from "@/shared/ui/base/styles";
import { Switch } from "@/shared/ui/base/parts";

// 두 칸을 다 쓰는 칸 · 버튼 줄.
const WIDE_FIELD = cn(field, "col-span-full");
const WIDE_ACTIONS = cn(formActions, "col-span-full");

const RoleSelect = ({ value, disabled }: { value: Role; disabled?: boolean }) => (
  <select className={input} name="role" defaultValue={value} disabled={disabled}>
    {(Object.entries(ROLE_LABEL) as [Role, string][]).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
  </select>
);

// 계정 관리 패널 (보안 총책임자) — 선택 없음 = 새 계정. 루트 계정은 루트만, 자기 역할 · 활성은 못 바꿉니다.
export function UserPanel({ u }: { u: UserRow | null }) {
  return u ? <EditUser u={u} /> : <NewUser />;
}

function NewUser() {
  const create = useCreateUser();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  }
  return (
    <>
      <PanelHead title="새 계정" />
      <form className={cn(panelBody, formGrid, "px-4.5 py-4")} id="user-form" onSubmit={onSubmit}>
        <label className={field}>아이디<input className={input} name="login_id" required maxLength={100} autoComplete="off" /></label>
        <label className={field}>이름<input className={input} name="display_name" required maxLength={100} /></label>
        <label className={field}>부서<input className={input} name="department" maxLength={100} /></label>
        <label className={field}>역할<RoleSelect value="user" /></label>
        <label className={WIDE_FIELD}>임시 비밀번호 (첫 로그인에 바꾸게 됩니다)<input className={input} name="password" type="password" required autoComplete="new-password" /></label>
        <div className={WIDE_ACTIONS}><PanelMsg /><button type="submit" className={cn(actionButton, primaryButton)}>계정 만들기</button></div>
      </form>
    </>
  );
}

function EditUser({ u }: { u: UserRow }) {
  const me = useMe();
  const action = useUserAction();
  // 저장 뒤 서버 값으로 다시 그리고 초기화 칸을 비웁니다 (폼은 uncontrolled).
  const formKey = `${u.id}:${useQuery(usersQuery()).dataUpdatedAt}`;
  const self = u.id === me.id;
  const locked = u.is_root && !me.is_root;
  const fixed = u.is_root || self;
  const note = locked ? "루트 계정은 루트만 고칠 수 있습니다."
    : u.is_root ? "루트는 역할을 바꾸거나 정지할 수 없습니다."
      : self ? "자기 계정의 역할을 바꾸거나 정지할 수 없습니다."
        : "계정은 지우지 않고 정지합니다 (결재 기록이 가리킵니다).";

  function onEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const patch: Record<string, unknown> = { display_name: f.get("display_name"), department: f.get("department"), log_id: f.get("log_id") };
    if (!fixed) patch.role = f.get("role");
    action.mutate({ id: u.id, patch });
  }
  // 활성 · 정지는 저장과 따로 바로 적용합니다. 바꾸기 전에 한 번 묻습니다.
  function onToggle(on: boolean) {
    const who = `${u.display_name} (${u.login_id}) 계정을`;
    const ask = on ? `${who} 다시 활성으로 바꿉니다. 로그인할 수 있게 됩니다. 계속할까요?`
      : `${who} 정지합니다. 로그인이 막히고, 지금 로그인한 세션도 바로 끊깁니다. 계속할까요?`;
    if (confirm(ask)) action.mutate({ id: u.id, patch: { is_active: on }, done: on ? "✓ 활성으로 바꿨습니다" : "✓ 정지했습니다" });
  }
  function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    action.mutate({ id: u.id, temporary_password: String(new FormData(e.currentTarget).get("temporary_password")) });
  }

  return (
    <>
      <PanelHead title="계정" />
      <div className={panelBody}>
        <p className={subject}>{u.display_name} ({u.login_id})</p>
        <div className={meta}>{ROLE_LABEL[u.role]}{u.is_root ? " · 루트" : ""} · 만든 날 {stamp(u.created_at)}{u.last_login_at ? ` · 마지막 로그인 ${stamp(u.last_login_at)}` : ""}</div>
        {!locked && (
          <>
            <Switch className="mt-3.5" checked={u.is_active} disabled={fixed || action.isPending} onChange={onToggle}
              label={u.is_active ? "활성" : "정지"} hint={u.is_active ? "로그인할 수 있습니다. 끄면 정지 · 세션 끊김" : "로그인할 수 없습니다. 켜면 다시 로그인할 수 있습니다"} />
            <form key={`edit:${formKey}`} className={cn(formGrid, "px-0 pt-3 pb-0")} id="user-edit" onSubmit={onEdit}>
              <label className={field}>이름<input className={input} name="display_name" defaultValue={u.display_name} maxLength={100} /></label>
              <label className={field}>부서<input className={input} name="department" defaultValue={u.department ?? ""} maxLength={100} /></label>
              <label className={field}>역할<RoleSelect value={u.role} disabled={fixed} /></label>
              <label className={field}>로그 사용자 ID<input className={input} name="log_id" defaultValue={u.log_id || ""} maxLength={100} placeholder="보안 솔루션 로그의 UserID" /></label>
              <div className={WIDE_ACTIONS}><button type="submit" className={cn(actionButton, primaryButton)}>저장</button></div>
            </form>
            <form key={`reset:${formKey}`} className={cn(formGrid, "px-0 pt-3 pb-0")} id="user-reset" onSubmit={onReset}>
              <label className={WIDE_FIELD}>비밀번호 초기화 — 임시 비밀번호<input className={input} name="temporary_password" type="password" required autoComplete="new-password" /></label>
              <div className={WIDE_ACTIONS}><button type="submit" className={actionButton}>초기화</button></div>
            </form>
          </>
        )}
      </div>
      <PanelFoot note={note} />
    </>
  );
}
