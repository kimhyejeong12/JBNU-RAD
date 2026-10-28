import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateUser, useUserAction } from "./api";
import { useMe } from "@/app/me";
import { useUi } from "@/app/ui/UiContext";
import { PanelHead } from "@/app/ui/PanelHead";
import { usersQuery } from "@/shared/api/queries";
import type { Role, UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { ROLE_LABEL } from "@/shared/lib/labels";
import { PanelMsg } from "@/shared/ui/PanelMsg";

const RoleSelect = ({ value, disabled }: { value: Role; disabled?: boolean }) => (
  <select name="role" defaultValue={value} disabled={disabled}>
    {(Object.entries(ROLE_LABEL) as [Role, string][]).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
  </select>
);

// 계정 관리 패널 (보안 총책임자) — 선택 없음 = 새 계정. 루트 계정은 루트만, 자기 역할 · 활성은 못 바꿉니다.
export function UserPanel({ u }: { u: UserRow | null }) {
  return u ? <EditUser u={u} /> : <NewUser />;
}

function NewUser() {
  const { ui } = useUi();
  const create = useCreateUser();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  }
  return (
    <>
      <PanelHead title="새 계정" />
      <form className="panel-body form-grid" id="user-form" style={{ padding: "16px 18px" }} onSubmit={onSubmit}>
        <label>아이디<input name="login_id" required maxLength={100} autoComplete="off" /></label>
        <label>이름<input name="display_name" required maxLength={100} /></label>
        <label>부서<input name="department" maxLength={100} /></label>
        <label>역할<RoleSelect value="user" /></label>
        <label className="wide">임시 비밀번호 (첫 로그인에 바꾸게 됩니다)<input name="password" type="password" required autoComplete="new-password" /></label>
        <div className="wide form-actions"><PanelMsg msg={ui.panelMsg} /><button type="submit" className="primary">계정 만들기</button></div>
      </form>
    </>
  );
}

function EditUser({ u }: { u: UserRow }) {
  const me = useMe();
  const { ui } = useUi();
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
    if (!fixed) {
      patch.role = f.get("role");
      patch.is_active = f.get("is_active") === "on";
    }
    action.mutate({ id: u.id, patch });
  }
  function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    action.mutate({ id: u.id, temporary_password: String(new FormData(e.currentTarget).get("temporary_password")) });
  }

  return (
    <>
      <PanelHead title="계정" />
      <div className="panel-body">
        <p className="subject">{u.display_name} ({u.login_id})</p>
        <div className="meta">{ROLE_LABEL[u.role]}{u.is_root ? " · 루트" : ""} · 만든 날 {stamp(u.created_at)}{u.last_login_at ? ` · 마지막 로그인 ${stamp(u.last_login_at)}` : ""}</div>
        {!locked && (
          <>
            <form key={`edit:${formKey}`} className="form-grid" id="user-edit" style={{ padding: "12px 0 0" }} onSubmit={onEdit}>
              <label>이름<input name="display_name" defaultValue={u.display_name} maxLength={100} /></label>
              <label>부서<input name="department" defaultValue={u.department ?? ""} maxLength={100} /></label>
              <label>역할<RoleSelect value={u.role} disabled={fixed} /></label>
              <label>로그 사용자 ID<input name="log_id" defaultValue={u.log_id || ""} maxLength={100} placeholder="보안 솔루션 로그의 UserID" /></label>
              <label className="check wide"><input type="checkbox" name="is_active" defaultChecked={u.is_active} disabled={fixed} />활성 (끄면 정지 · 세션 끊김)</label>
              <div className="wide form-actions"><button type="submit" className="primary">저장</button></div>
            </form>
            <form key={`reset:${formKey}`} className="form-grid" id="user-reset" style={{ padding: "12px 0 0" }} onSubmit={onReset}>
              <label className="wide">비밀번호 초기화 — 임시 비밀번호<input name="temporary_password" type="password" required autoComplete="new-password" /></label>
              <div className="wide form-actions"><button type="submit">초기화</button></div>
            </form>
          </>
        )}
      </div>
      <div className="panel-foot">{ui.panelMsg ? <PanelMsg msg={ui.panelMsg} /> : <p className="note">{note}</p>}</div>
    </>
  );
}
