import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateUser, useUserAction } from "./api";
import { roleMenus, roleText } from "./lib";
import { useMe } from "@/app/session/me";
import { canManageAccounts } from "@/app/session/views";
import { useRequests } from "@/app/session/data";
import { ChangeLog, Panel, PanelFoot, PanelMsg } from "@/app/ui/panel/Panel";
import { usersQuery } from "@/shared/api/queries";
import type { Role, UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { isActive } from "@/shared/lib/request";
import { ROLE_LABEL } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { useUi } from "@/app/ui/state/UiContext";
import { formProblem } from "@/shared/lib/form";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { actionButton, field, formActions, formGrid, input, meta, note, primaryButton, subject, toolButton } from "@/shared/ui/styles";
import { Icon } from "@/shared/ui/Icon";
import { Meta, Pill, Section, Switch } from "@/shared/ui/parts";
import { ask } from "@/app/ui/ask";

const WIDE_FIELD = cn(field, "col-span-full");
const WIDE_ACTIONS = cn(formActions, "col-span-full");
const BOX = "rounded-xl border border-line px-3.5 py-3";

// 정보 상자 한 줄 — 왼쪽 기호와 이름, 오른쪽 값(고칠 수 있으면 입력 칸).
// wide 는 이름이 긴 줄(로그 사용자 ID)이 한 줄에 들어가게 이름 칸을 넓힙니다.
function InfoRow({ icon, label, wide, children }: { icon: string; label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid items-center gap-3 py-1.25", wide ? "grid-cols-[116px_minmax(0,1fr)]" : "grid-cols-[92px_minmax(0,1fr)]")}>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-ink-dim"><Icon name={icon} small />{label}</span>
      <div className="min-w-0 text-[13px]">{children}</div>
    </div>
  );
}

// 폼이 이름(role)으로 읽으므로 라디오는 글자로만 숨깁니다.
const ROLES: Role[] = ["user", "manager", "top"];
const RoleSelect = ({ value, disabled }: { value: Role; disabled?: boolean }) => (
  <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-line bg-surface p-0.75" role="radiogroup" aria-label="역할">
    {ROLES.map((k) => (
      <label key={k} className={cn("whitespace-nowrap rounded-md px-1 py-1.5 text-center text-[12px] font-semibold text-ink-dim has-checked:bg-brand has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-ink",
        disabled ? "cursor-not-allowed has-checked:opacity-70" : "cursor-pointer hover:text-ink")}>
        <input className="sr-only" type="radio" name="role" value={k} defaultChecked={k === value} disabled={disabled} />{ROLE_LABEL[k]}
      </label>
    ))}
  </div>
);

export function UserPanel({ u }: { u: UserRow | null }) {
  return u ? <EditUser u={u} /> : <NewUser />;
}

// [새 계정]은 계정을 관리하는 사람에게만 보여 여기서는 역할을 늘 고릅니다.
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
    <Panel title="새 계정">
    {/* 패널 높이를 채우는 격자라 줄이 벌어지지 않게 위에서부터 쌓습니다(content-start). */}
    <form className={cn(formGrid, "content-start p-0")} id="user-form" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
      <label className={field}>아이디<input className={input} name="login_id" required maxLength={100} autoComplete="off" /></label>
      <label className={field}>이름<input className={input} name="display_name" required maxLength={100} /></label>
      <label className={field}>부서<input className={input} name="department" maxLength={100} /></label>
      <label className={field}>직무<input className={input} name="job" maxLength={100} placeholder="예: 서버 운영 담당" /></label>
      <div className={WIDE_FIELD}>역할<RoleSelect value="user" /></div>
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
  const admin = canManageAccounts(me);
  // 업무 접근 권한 — 이 사람이 지금 가진 권한 (시스템 역할과 따로 봅니다).
  const held = useRequests().filter((r) => r.requester_id === u.id && isActive(r)).map((r) => r.requested_access);
  // 보안 총책임자는 보기만 하고 역할 변경은 알림 · 변경 이력으로 감독합니다.
  const locked = !admin || (u.is_root && !me.is_root);
  const fixed = u.is_root || self;
  const lockText = !admin ? "계정 관리는 보안 운영자가 합니다."
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
    if (canRole) {
      const role = f.get("role") as Role;
      // 저장하면 권한이 바로 오르내려서 역할이 바뀔 때만 묻습니다.
      if (role !== u.role && !(await ask({
        title: "역할 바꾸기", confirm: "바꾸기", danger: true,
        message: `${u.display_name}: ${ROLE_LABEL[u.role]} → ${ROLE_LABEL[role]}`,
      }))) return;
      patch.role = role;
    }
    // 상태도 [저장] 때 함께 — [취소]로 되돌릴 수 있게. 정지는 로그인을 막고 세션을 끊어서 정지할 때만 묻습니다.
    if (active !== u.is_active) {
      if (!active && !(await ask({
        title: "계정 정지", confirm: "정지", danger: true,
        message: `${u.display_name} 계정을 정지합니다. 로그인 중이면 바로 끊깁니다.`,
      }))) return;
      patch.is_active = active;
    }
    action.mutate({ id: u.id, patch }, { onSuccess: () => setEditing(false) });
  }
  const [temp, setTemp] = useState("");
  // 처음에는 값만 보이고 [수정]을 눌러야 입력 칸 · 계정 관리가 나옵니다 — 고칠 수 있다는 것이 버튼으로 드러납니다.
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(u.is_active);
  const canRole = !locked && !fixed;
  async function onReset() {
    if (!temp) return setPanelMsg("임시 비밀번호를 입력하세요");
    if (!(await ask({
      title: "비밀번호 초기화", confirm: "초기화", danger: true,
      message: `${u.display_name}의 비밀번호를 임시 비밀번호로 바꿉니다.`,
    }))) return;
    action.mutate({ id: u.id, temporary_password: temp }, { onSuccess: () => setTemp("") });
  }

  // 시안 순서 — 프로필, 정보 상자, 권한 정보(SentinelAI 메뉴), 계정 관리(수정 때만), 추가 설정. 비밀번호 칸은 이름이 없어 저장에 실리지 않고 [초기화]로 따로 보냅니다.
  const edit = !locked && !editing && (
    <button type="button" className={toolButton} id="user-edit-start" onClick={() => { setActive(u.is_active); setEditing(true); }}><Icon name="pencil" small />수정</button>
  );
  return (
    <Panel title="계정 상세 정보" actions={edit} foot={<PanelFoot />}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(subject, "mb-0")}>{u.display_name} ({u.login_id})</p>
          <div className={meta}><Meta items={[roleText(u), u.department || "부서 없음"]} /></div>
        </div>
        <Pill tone={u.is_active ? "border-ok-line bg-ok-tint text-ok" : "border-line text-ink-dim"} className="gap-1 py-1">
          <Icon name={u.is_active ? "check" : "close"} small />{u.is_active ? "활성 계정" : "정지 계정"}
        </Pill>
      </div>
      <form key={`edit:${formKey}`} id="user-edit" onKeyDown={noEnterSubmit} onSubmit={onEdit}>
        <div className="mt-4 rounded-xl bg-canvas px-3.5 py-2">
          {editing && (
            <>
              <InfoRow icon="users" label="이름"><input className={input} name="display_name" aria-label="이름" defaultValue={u.display_name} maxLength={100} /></InfoRow>
              <InfoRow icon="briefcase" label="부서"><input className={input} name="department" aria-label="부서" defaultValue={u.department ?? ""} maxLength={100} /></InfoRow>
            </>
          )}
          <InfoRow icon="list" label="직무">
            {editing ? <input className={input} name="job" aria-label="직무" defaultValue={u.job} maxLength={100} placeholder="예: 서버 운영 담당" /> : u.job || "없음"}
          </InfoRow>
          <InfoRow icon="gear" label="역할">{editing && canRole ? <RoleSelect value={u.role} /> : roleText(u)}</InfoRow>
          <InfoRow icon="key" label="업무 권한">{held.length ? held.join(", ") : "없음"}</InfoRow>
          <InfoRow icon="calendar" label="계정 생성일"><span className="tabular-nums">{stamp(u.created_at)}</span></InfoRow>
        </div>
        {lockText && <p className={cn(note, "flex items-center gap-1")}><Icon name="lock" small />{lockText}</p>}
        <Section icon="shield" title="권한 정보 (SentinelAI)">
          <div className="flex flex-wrap gap-1.5">
            {roleMenus(u.role).map((m) => <Pill key={m} className="gap-1 rounded-md"><Icon name="check" small />{m}</Pill>)}
          </div>
        </Section>
        {editing && (
          <Section icon="lock" title="계정 관리">
            <div className={cn(BOX, "flex flex-col gap-2.5")}>
              <div className="flex items-center gap-3">
                <span className="w-20 flex-none text-[12.5px] font-semibold text-ink-dim">상태</span>
                <Switch checked={active} disabled={fixed} onChange={setActive} label={active ? "활성" : "정지"} />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-20 flex-none text-[12.5px] font-semibold text-ink-dim">비밀번호</span>
                <input className={input} type="password" autoComplete="new-password" placeholder="임시 비밀번호" aria-label="임시 비밀번호" value={temp} onChange={(e) => setTemp(e.target.value)} />
                <button type="button" className={cn(actionButton, "flex-none")} onClick={() => void onReset()}>초기화</button>
              </div>
            </div>
          </Section>
        )}
        <Section icon="gear" title="추가 설정">
          {editing ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 narrow:grid-cols-1">
              <label className={field}>로그 사용자 ID<input className={input} name="log_id" defaultValue={u.log_id || ""} maxLength={100} placeholder="로그의 UserID" /></label>
              <label className={field}>퇴사일<input className={input} name="left_on" type="date" defaultValue={u.left_on} /></label>
            </div>
          ) : (
            <div className="px-3.5">
              <InfoRow wide icon="file" label="로그 사용자 ID">{u.log_id || "없음"}</InfoRow>
              <InfoRow wide icon="calendar" label="퇴사일"><span className="tabular-nums">{u.left_on || "없음"}</span></InfoRow>
            </div>
          )}
        </Section>
        {editing && (
          <div className={cn(formActions, "mt-3")}>
            <button type="button" className={actionButton} onClick={() => setEditing(false)}>취소</button>
            <button type="submit" className={cn(actionButton, primaryButton)}>저장</button>
          </div>
        )}
      </form>
      <ChangeLog type="user" id={String(u.id)} rev={formKey} />
    </Panel>
  );
}
