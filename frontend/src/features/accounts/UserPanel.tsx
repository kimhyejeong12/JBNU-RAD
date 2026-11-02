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
import { useUi } from "@/app/ui/state/UiContext";
import { formProblem } from "@/shared/lib/form";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { actionButton, field, formActions, formGrid, input, meta, panelBody, primaryButton, subject } from "@/shared/ui/base/styles";
import { Switch } from "@/shared/ui/base/parts";
import { ask } from "@/app/ui/ask";

// 두 칸을 다 쓰는 칸 · 버튼 줄.
const WIDE_FIELD = cn(field, "col-span-full");
const WIDE_ACTIONS = cn(formActions, "col-span-full");

// 역할 고르기 — 세 역할을 버튼으로 늘어놓습니다 (고르기 칸은 눌러 봐야 무엇이 있는지 보여서). 폼이 이름(role)으로 읽는 라디오는 글자로만 숨깁니다.
const ROLES: Role[] = ["user", "manager", "top"];
const RoleSelect = ({ value, disabled }: { value: Role; disabled?: boolean }) => (
  <div className="flex flex-wrap gap-0.5 self-start rounded-lg bg-canvas p-0.75" role="radiogroup" aria-label="역할">
    {ROLES.map((k) => (
      <label key={k} className={cn("rounded-md px-2.75 py-1.25 text-[12.5px] font-semibold text-ink-dim has-checked:bg-surface has-checked:text-ink has-checked:shadow-[0_1px_2px_rgba(0,0,0,.08)] has-focus-visible:outline-2 has-focus-visible:outline-ink",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:text-ink")}>
        <input className="sr-only" type="radio" name="role" value={k} defaultChecked={k === value} disabled={disabled} />{ROLE_LABEL[k]}
      </label>
    ))}
  </div>
);

// 계정 관리 패널 (보안 총책임자) — 선택 없음 = 새 계정. 루트 계정은 루트만, 자기 역할 · 활성은 못 바꿉니다.
export function UserPanel({ u }: { u: UserRow | null }) {
  return u ? <EditUser u={u} /> : <NewUser />;
}

function NewUser() {
  const create = useCreateUser();
  const { setPanelMsg } = useUi();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formProblem(e.currentTarget);
    if (problem) return setPanelMsg(problem);
    create.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  }
  return (
    <>
      <PanelHead title="새 계정" />
      <form className={cn(panelBody, formGrid, "px-4.5 py-4")} id="user-form" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
        <label className={field}>아이디<input className={input} name="login_id" required maxLength={100} autoComplete="off" /></label>
        <label className={field}>이름<input className={input} name="display_name" required maxLength={100} /></label>
        <label className={field}>부서<input className={input} name="department" maxLength={100} /></label>
        <div className={WIDE_FIELD}>역할<RoleSelect value="user" /></div>
        <label className={WIDE_FIELD}>임시 비밀번호 (첫 로그인에 바꾸게 됩니다)<input className={input} name="password" type="password" required autoComplete="new-password" /></label>
        <div className={WIDE_ACTIONS}><PanelMsg /><button type="submit" className={cn(actionButton, primaryButton)}>계정 만들기</button></div>
      </form>
    </>
  );
}

function EditUser({ u }: { u: UserRow }) {
  const me = useMe();
  const { setPanelMsg } = useUi();
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

  async function onEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const patch: Record<string, unknown> = { display_name: f.get("display_name"), department: f.get("department"), log_id: f.get("log_id") };
    if (!fixed) {
      const role = f.get("role") as Role;
      // 역할이 바뀔 때만 묻습니다 — 저장하면 권한이 바로 오르내려서. 이름 · 부서만 고칠 때는 묻지 않습니다.
      if (role !== u.role && !(await ask({
        title: "역할 바꾸기", confirm: "바꾸기", danger: true,
        message: `${u.display_name} (${u.login_id})의 역할을 바꿉니다: ${ROLE_LABEL[u.role]} → ${ROLE_LABEL[role]}. 저장하면 바로 그 역할의 메뉴와 권한이 적용됩니다.`,
      }))) return;
      patch.role = role;
    }
    action.mutate({ id: u.id, patch });
  }
  // 활성 · 정지는 저장과 따로 바로 적용합니다. 정지할 때만 묻습니다 — 로그인이 막히고 세션이 끊겨서. 활성은 해가 없어 묻지 않습니다.
  async function onToggle(on: boolean) {
    if (!on && !(await ask({
      title: "계정 정지", confirm: "정지", danger: true,
      message: `${u.display_name} (${u.login_id}) 계정을 정지합니다. 로그인이 막히고, 지금 로그인한 세션도 바로 끊깁니다.`,
    }))) return;
    action.mutate({ id: u.id, patch: { is_active: on }, done: on ? "✓ 활성으로 바꿨습니다" : "✓ 정지했습니다" });
  }
  // 비밀번호 초기화 — 다른 사람의 비밀번호가 바로 바뀌어 한 번 묻습니다.
  async function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formProblem(e.currentTarget);
    if (problem) return setPanelMsg(problem);
    const temporary_password = String(new FormData(e.currentTarget).get("temporary_password"));
    if (!(await ask({
      title: "비밀번호 초기화", confirm: "초기화", danger: true,
      message: `${u.display_name} (${u.login_id})의 비밀번호를 지금 적은 임시 비밀번호로 바꿉니다. 그 사람은 다음 로그인 때 비밀번호를 새로 정해야 합니다.`,
    }))) return;
    action.mutate({ id: u.id, temporary_password });
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
            <form key={`edit:${formKey}`} className={cn(formGrid, "px-0 pt-3 pb-0")} id="user-edit" onKeyDown={noEnterSubmit} onSubmit={onEdit}>
              <label className={field}>이름<input className={input} name="display_name" defaultValue={u.display_name} maxLength={100} /></label>
              <label className={field}>부서<input className={input} name="department" defaultValue={u.department ?? ""} maxLength={100} /></label>
              <div className={WIDE_FIELD}>역할<RoleSelect value={u.role} disabled={fixed} /></div>
              <label className={field}>로그 사용자 ID<input className={input} name="log_id" defaultValue={u.log_id || ""} maxLength={100} placeholder="보안 솔루션 로그의 UserID" /></label>
              <div className={WIDE_ACTIONS}><button type="submit" className={cn(actionButton, primaryButton)}>저장</button></div>
            </form>
            <form key={`reset:${formKey}`} className={cn(formGrid, "px-0 pt-3 pb-0")} id="user-reset" noValidate onKeyDown={noEnterSubmit} onSubmit={onReset}>
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
