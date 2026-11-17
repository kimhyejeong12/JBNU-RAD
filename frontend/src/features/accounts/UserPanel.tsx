import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateUser, useUserAction } from "./api";
import { useMe } from "@/app/session/me";
import { useRequests } from "@/app/session/data";
import { ChangeLog } from "@/app/ui/panel/ChangeLog";
import { Panel, PanelFoot, PanelMsg } from "@/app/ui/panel/Panel";
import { usersQuery } from "@/shared/api/queries";
import type { Role, UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { isActive } from "@/shared/lib/request";
import { ROLE_LABEL } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { useUi } from "@/app/ui/state/UiContext";
import { formProblem } from "@/shared/lib/form";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { actionButton, field, formActions, formGrid, input, meta, note, primaryButton, subject } from "@/shared/ui/base/styles";
import { Icon } from "@/shared/ui/base/Icon";
import { GroupBox, Meta, Section, Switch } from "@/shared/ui/base/parts";
import { ask } from "@/app/ui/confirm/ask";

const WIDE_FIELD = cn(field, "col-span-full");
const WIDE_ACTIONS = cn(formActions, "col-span-full");
const BOX_GRID = "grid grid-cols-2 gap-x-3 gap-y-2.5 narrow:grid-cols-1";

// 폼이 이름(role)으로 읽으므로 라디오는 글자로만 숨깁니다.
const ROLES: Role[] = ["user", "manager", "top"];
const RoleSelect = ({ value, disabled }: { value: Role; disabled?: boolean }) => (
  <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-line bg-surface p-0.75" role="radiogroup" aria-label="역할">
    {ROLES.map((k) => (
      <label key={k} className={cn("rounded-md px-2 py-1.5 text-center text-[12.5px] font-semibold text-ink-dim has-checked:bg-brand has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-ink",
        disabled ? "cursor-not-allowed has-checked:opacity-70" : "cursor-pointer hover:text-ink")}>
        <input className="sr-only" type="radio" name="role" value={k} defaultChecked={k === value} disabled={disabled} />{ROLE_LABEL[k]}
      </label>
    ))}
  </div>
);

export function UserPanel({ u }: { u: UserRow | null }) {
  return u ? <EditUser u={u} /> : <NewUser />;
}

function NewUser() {
  const top = useMe().role === "top";
  const create = useCreateUser();
  const { setPanelMsg } = useUi();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formProblem(e.currentTarget);
    if (problem) return setPanelMsg(problem);
    create.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  }
  return (
    <Panel title="새 계정">
    {/* 패널 높이를 채우는 격자라 줄이 벌어지지 않게 위에서부터 쌓습니다(content-start). */}
    <form className={cn(formGrid, "content-start p-0")} id="user-form" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
      <label className={field}>아이디<input className={input} name="login_id" required maxLength={100} autoComplete="off" /></label>
      <label className={field}>이름<input className={input} name="display_name" required maxLength={100} /></label>
      <label className={field}>부서<input className={input} name="department" maxLength={100} /></label>
      <label className={field}>직무<input className={input} name="job" maxLength={100} placeholder="예: 서버 운영 담당" /></label>
      {top ? <div className={WIDE_FIELD}>역할<RoleSelect value="user" /></div> : <input type="hidden" name="role" value="user" />}
      <label className={WIDE_FIELD}>임시 비밀번호 (첫 로그인에 바꾸게 됩니다)<input className={input} name="password" type="password" required autoComplete="new-password" /></label>
      <div className={WIDE_ACTIONS}><PanelMsg /><button type="submit" className={cn(actionButton, primaryButton)}>계정 만들기</button></div>
    </form>
    </Panel>
  );
}

function EditUser({ u }: { u: UserRow }) {
  const me = useMe();
  const { setPanelMsg } = useUi();
  const action = useUserAction();
  // 폼이 uncontrolled 라 저장 뒤 서버 값으로 다시 그립니다.
  const formKey = `${u.id}:${useQuery(usersQuery()).dataUpdatedAt}`;
  const self = u.id === me.id;
  const top = me.role === "top";
  // 업무 접근 권한 — 이 사람이 지금 가진 권한 (시스템 역할과 따로 봅니다).
  const held = useRequests().filter((r) => r.requester_id === u.id && isActive(r)).map((r) => r.requested_access);
  // 역할과 보안 운영자 이상 계정은 보안 총책임자만 고칩니다.
  const above = !top && u.role !== "user";
  const locked = (u.is_root && !me.is_root) || above;
  const fixed = u.is_root || self;
  const lockText = above ? "보안 운영자 이상 계정은 보안 총책임자만 고칠 수 있습니다."
    : locked ? "루트 계정은 루트만 고칠 수 있습니다."
    : u.is_root ? "루트는 역할을 바꾸거나 정지할 수 없습니다."
      : self ? "자기 계정의 역할을 바꾸거나 정지할 수 없습니다."
        : "";

  async function onEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const patch: Record<string, unknown> = {
      display_name: f.get("display_name"), department: f.get("department"), job: f.get("job"), log_id: f.get("log_id"), left_on: f.get("left_on"),
    };
    // 부서 · 직무를 옮기면 지금 가진 권한을 AI 가 다시 판정합니다 (빈 칸을 처음 채우는 것은 이동이 아님).
    const moved = (["department", "job"] as const).filter((k) => (u[k] ?? "") !== "" && String(f.get(k) ?? "").trim() !== (u[k] ?? ""));
    if (moved.length && !(await ask({
      title: "부서 이동", confirm: "저장",
      message: `${u.display_name}의 ${moved.map((k) => (k === "department" ? "부서" : "직무")).join(", ")}를 바꿉니다. 가진 권한을 다시 판정합니다.`,
    }))) return;
    const leftOn = String(f.get("left_on") ?? "");
    if (leftOn && leftOn !== u.left_on && !(await ask({
      title: "퇴사일 적기", confirm: "저장", danger: true,
      message: `${u.display_name}의 퇴사일을 ${leftOn}로 적습니다.`,
    }))) return;
    if (top && !fixed) {
      const role = f.get("role") as Role;
      // 저장하면 권한이 바로 오르내려서 역할이 바뀔 때만 묻습니다.
      if (role !== u.role && !(await ask({
        title: "역할 바꾸기", confirm: "바꾸기", danger: true,
        message: `${u.display_name}: ${ROLE_LABEL[u.role]} → ${ROLE_LABEL[role]}`,
      }))) return;
      patch.role = role;
    }
    action.mutate({ id: u.id, patch });
  }
  // 정지는 로그인을 막고 세션을 끊어서 정지할 때만 묻습니다.
  async function onToggle(on: boolean) {
    if (!on && !(await ask({
      title: "계정 정지", confirm: "정지", danger: true,
      message: `${u.display_name} 계정을 정지합니다. 로그인 중이면 바로 끊깁니다.`,
    }))) return;
    action.mutate({ id: u.id, patch: { is_active: on }, done: on ? "✓ 활성으로 바꿨습니다" : "✓ 정지했습니다" });
  }
  async function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = formProblem(e.currentTarget);
    if (problem) return setPanelMsg(problem);
    const temporary_password = String(new FormData(e.currentTarget).get("temporary_password"));
    if (!(await ask({
      title: "비밀번호 초기화", confirm: "초기화", danger: true,
      message: `${u.display_name}의 비밀번호를 임시 비밀번호로 바꿉니다.`,
    }))) return;
    action.mutate({ id: u.id, temporary_password });
  }

  return (
    <Panel title="계정" foot={<PanelFoot />}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={subject}>{u.display_name} ({u.login_id})</p>
          <div className={meta}><Meta items={[`만든 날 ${stamp(u.created_at)}`, u.last_login_at && `마지막 로그인 ${stamp(u.last_login_at)}`]} /></div>
        </div>
        <Switch checked={u.is_active} disabled={locked || fixed || action.isPending} onChange={onToggle}
          label={u.is_active ? "활성" : "정지"} hint={u.is_active ? "로그인 가능" : "로그인 막힘"} />
      </div>
      {/* 고칠 수 없는 계정도 칸은 보이고 막기만 합니다. */}
      <form key={`edit:${formKey}`} id="user-edit" onKeyDown={noEnterSubmit} onSubmit={onEdit}>
        <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
          <GroupBox icon="briefcase" title="업무 정보 (AI 판정 근거)">
            <div className={BOX_GRID}>
              <label className={field}>이름<input className={input} name="display_name" defaultValue={u.display_name} maxLength={100} /></label>
              <label className={field}>부서<input className={input} name="department" defaultValue={u.department ?? ""} maxLength={100} /></label>
              <label className={WIDE_FIELD}>직무<input className={input} name="job" defaultValue={u.job} maxLength={100} placeholder="예: 서버 운영 담당" /></label>
              <label className={field}>로그 사용자 ID<input className={input} name="log_id" defaultValue={u.log_id || ""} maxLength={100} placeholder="로그의 UserID" /></label>
              <label className={field}>퇴사일<input className={input} name="left_on" type="date" defaultValue={u.left_on} /></label>
              <div className={WIDE_FIELD}>지금 가진 권한<span className="text-[13px] font-normal text-ink">{held.length ? held.join(", ") : "없음"}</span></div>
            </div>
          </GroupBox>
          <GroupBox icon="monitor" title="시스템 역할 (SentinelAI)">
            <RoleSelect value={u.role} disabled={!top || fixed} />
            {lockText && <p className={cn(note, "flex items-center gap-1")}><Icon name="lock" small />{lockText}</p>}
          </GroupBox>
          {!locked && <div className={cn(formActions, "mt-3")}><button type="submit" className={cn(actionButton, primaryButton)}>저장</button></div>}
        </fieldset>
      </form>
      {!locked && (
        <Section icon="lock" title="비밀번호 초기화">
          <form key={`reset:${formKey}`} className="flex gap-2" id="user-reset" noValidate onKeyDown={noEnterSubmit} onSubmit={onReset}>
            <input className={input} name="temporary_password" type="password" required autoComplete="new-password" placeholder="임시 비밀번호" aria-label="임시 비밀번호" />
            <button type="submit" className={cn(actionButton, "flex-none")}>초기화</button>
          </form>
        </Section>
      )}
      <ChangeLog type="user" id={String(u.id)} rev={formKey} />
    </Panel>
  );
}
