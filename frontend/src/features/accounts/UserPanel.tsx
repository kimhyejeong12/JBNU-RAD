import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateUser, useUserAction } from "./api";
import { ROLE_DUTY } from "./lib";
import { useMe } from "@/app/session/me";
import { canManageAccounts } from "@/app/session/views";
import { useRequests } from "@/app/session/data";
import { EditActions, Panel, PanelFoot, PanelMsg, RecordHead, type PanelMode, type PanelRecord } from "@/app/ui/panel/Panel";
import { usersQuery } from "@/shared/api/queries";
import type { Role, UserRow } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { isActive } from "@/shared/lib/request";
import { ROLE_LABEL } from "@/shared/lib/labels";
import { cn } from "@/shared/lib/cn";
import { useUi } from "@/app/ui/state/UiContext";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { actionButton, field, input, note, panelFormGrid, primaryAction, rowInput, wideActions, wideField } from "@/shared/ui/styles";
import { Icon } from "@/shared/ui/Icon";
import { GroupBox, InfoRow, Switch } from "@/shared/ui/parts";
import { confirmBox } from "@/app/ui/confirm";
import { checkForm } from "@/shared/lib/form";

// 폼이 이름(role)으로 읽으므로 라디오는 글자로만 숨김
const ROLES: Role[] = ["user", "manager", "top"];
const RoleSelect = ({ value, disabled }: { value: Role; disabled?: boolean }) => (
  <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-line bg-surface p-0.75" role="radiogroup" aria-label="역할">
    {ROLES.map((k) => (
      <label key={k} className={cn("whitespace-nowrap rounded-md px-1 py-1 text-center text-[12px] font-semibold text-ink-dim has-checked:bg-brand has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-ink",
        disabled ? "cursor-not-allowed has-checked:opacity-70" : "cursor-pointer hover:text-ink")}>
        <input className="sr-only" type="radio" name="role" value={k} defaultChecked={k === value} disabled={disabled} />{ROLE_LABEL[k]}
      </label>
    ))}
  </div>
);

export function UserPanel({ u }: { u: UserRow | null }) {
  return u ? <EditUser u={u} /> : <NewUser />;
}

// [새 계정]은 계정을 관리하는 사람에게만 보여 여기서는 역할을 늘 고름
function NewUser() {
  const create = useCreateUser();
  const { setPanelMsg } = useUi();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const f = checkForm(e, setPanelMsg);
    if (!f) return;
    create.mutate(Object.fromEntries(f));
  }
  return (
    <Panel title="새 계정">
    {/* 패널 높이를 채우는 격자라 줄이 벌어지지 않게 위에서부터 쌓음(content-start) */}
    <form className={panelFormGrid} id="user-form" noValidate onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
      <label className={field}>아이디<input className={input} name="login_id" required maxLength={100} autoComplete="off" /></label>
      <label className={field}>이름<input className={input} name="display_name" required maxLength={100} /></label>
      <label className={field}>부서<input className={input} name="department" maxLength={100} /></label>
      <label className={field}>직무<input className={input} name="job" maxLength={100} placeholder="예: 서버 운영 담당" /></label>
      <div className={wideField}>역할<RoleSelect value="user" /></div>
      <label className={wideField}>임시 비밀번호 (첫 로그인에 바꾸게 됩니다)<input className={input} name="password" type="password" required autoComplete="new-password" /></label>
      <div className={wideActions}><PanelMsg /><button type="submit" className={primaryAction}>계정 만들기</button></div>
    </form>
    </Panel>
  );
}

function EditUser({ u }: { u: UserRow }) {
  const me = useMe();
  const { setPanelMsg } = useUi();
  const action = useUserAction();
  // 폼이 uncontrolled 라 저장 뒤 서버 값으로 다시 그림
  const formKey = `${u.id}:${useQuery(usersQuery()).dataUpdatedAt}`;
  const self = u.id === me.id;
  const admin = canManageAccounts(me);
  // 업무 접근 권한 — 이 사람이 지금 가진 권한 (시스템 역할과 따로 봄)
  const held = useRequests().filter((r) => r.requester_id === u.id && isActive(r)).map((r) => r.requested_access);
  // 보안 총책임자는 보기만 하고 역할 변경은 알림 · 변경 이력으로 감독함
  const locked = !admin || (u.is_root && !me.is_root);
  const fixed = u.is_root || self;
  const canRole = !locked && !fixed;
  const lockText = !admin ? "계정 관리는 보안 운영자가 합니다."
    : locked ? "처음 설정한 계정이라 본인만 고칠 수 있습니다."
    : u.is_root ? "처음 설정한 계정이라 역할을 바꾸거나 정지할 수 없습니다."
      : self ? "자기 계정의 역할을 바꾸거나 정지할 수 없습니다."
        : "";
  // 처음에는 값만 보이고 [수정]을 눌러야 입력 칸이 나옴 — 고칠 수 있다는 것이 버튼으로 드러남
  const [mode, setMode] = useState<PanelMode>("view");
  const [active, setActive] = useState(u.is_active);
  const [temp, setTemp] = useState("");
  const editing = mode === "edit";
  const record: PanelRecord = {
    mode, editable: !locked, audit: { type: "user", id: String(u.id), rev: formKey },
    setMode: (m) => { if (m === "edit") setActive(u.is_active); setMode(m); },
  };

  async function onEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const patch: Record<string, unknown> = {
      display_name: f.get("display_name"), department: f.get("department"), job: f.get("job"), log_id: f.get("log_id"), left_on: f.get("left_on"),
    };
    // 부서 · 직무를 옮기면 지금 가진 권한을 AI 가 다시 판정함 (빈 칸을 처음 채우는 것은 이동이 아님)
    const moved = (["department", "job"] as const).filter((k) => (u[k] ?? "") !== "" && String(f.get(k) ?? "").trim() !== (u[k] ?? ""));
    if (moved.length && !(await confirmBox({
      title: "부서 이동", confirm: "저장",
      message: `${u.display_name}의 ${moved.map((k) => (k === "department" ? "부서" : "직무")).join(", ")}를 바꿉니다. 가진 권한을 다시 판정합니다.`,
    }))) return;
    const leftOn = String(f.get("left_on") ?? "");
    if (leftOn && leftOn !== u.left_on && !(await confirmBox({
      title: "퇴사일 적기", confirm: "저장", danger: true,
      message: `${u.display_name}의 퇴사일을 ${leftOn}로 적습니다.`,
    }))) return;
    if (canRole) {
      const role = f.get("role") as Role;
      // 저장하면 권한이 바로 오르내려서 역할이 바뀔 때만 물음
      if (role !== u.role && !(await confirmBox({
        title: "역할 바꾸기", confirm: "바꾸기", danger: true,
        message: `${u.display_name}: ${ROLE_LABEL[u.role]} → ${ROLE_LABEL[role]}`,
      }))) return;
      patch.role = role;
    }
    // 상태도 [저장] 때 함께 — [취소]로 되돌릴 수 있게. 정지는 로그인을 막고 세션을 끊어서 정지할 때만 물음
    if (active !== u.is_active) {
      if (!active && !(await confirmBox({
        title: "계정 정지", confirm: "정지", danger: true,
        message: `${u.display_name} 계정을 정지합니다. 로그인 중이면 바로 끊깁니다.`,
      }))) return;
      patch.is_active = active;
    }
    action.mutate({ id: u.id, patch }, { onSuccess: () => setMode("view") });
  }
  async function onReset() {
    if (!temp) return setPanelMsg("임시 비밀번호를 입력하세요");
    if (!(await confirmBox({
      title: "비밀번호 초기화", confirm: "초기화", danger: true,
      message: `${u.display_name}의 비밀번호를 임시 비밀번호로 바꿉니다.`,
    }))) return;
    action.mutate({ id: u.id, temporary_password: temp }, { onSuccess: () => setTemp("") });
  }

  // 업무 정보는 AI 판정에 들어가는 값(sources/people.py), SentinelAI 계정은 이 시스템의 역할 — 멘토 피드백대로 나눔
  // 비밀번호 칸은 이름이 없어 저장에 안 실림 — [초기화]로 따로 보냄
  return (
    <Panel title="계정 상세 정보" record={record} foot={<PanelFoot />}>
      <RecordHead record={record} title={<>{u.display_name} ({u.login_id})</>} info={[ROLE_LABEL[u.role], u.department || "부서 없음"]}
        state={{ on: u.is_active, text: u.is_active ? "활성 계정" : "정지 계정" }} />
      <form key={`edit:${formKey}`} id="user-edit" onKeyDown={noEnterSubmit} onSubmit={onEdit}>
        <GroupBox icon="briefcase" title="업무 정보" className="mt-3">
          <InfoRow icon="briefcase" label="부서">
            {editing ? <input className={rowInput} name="department" aria-label="부서" defaultValue={u.department ?? ""} maxLength={100} /> : u.department || "없음"}
          </InfoRow>
          <InfoRow icon="list" label="직무">
            {editing ? <input className={rowInput} name="job" aria-label="직무" defaultValue={u.job} maxLength={100} placeholder="예: 서버 운영 담당" /> : u.job || "없음"}
          </InfoRow>
          <InfoRow icon="key" label="업무 권한">{held.length ? held.join(", ") : "없음"}</InfoRow>
          <InfoRow icon="file" label="로그 사용자 ID">
            {editing ? <input className={rowInput} name="log_id" aria-label="로그 사용자 ID" defaultValue={u.log_id || ""} maxLength={100} placeholder="로그의 UserID" /> : u.log_id || "없음"}
          </InfoRow>
          <InfoRow icon="calendar" label="퇴사일">
            {editing ? <input className={rowInput} name="left_on" type="date" aria-label="퇴사일" defaultValue={u.left_on} /> : <span className="tabular-nums">{u.left_on || "없음"}</span>}
          </InfoRow>
        </GroupBox>
        <GroupBox icon="shield" title="SentinelAI 계정" className="mt-3">
          {editing && <InfoRow icon="users" label="이름"><input className={rowInput} name="display_name" aria-label="이름" defaultValue={u.display_name} maxLength={100} /></InfoRow>}
          <InfoRow icon="gear" label="역할">
            {editing && canRole ? <RoleSelect value={u.role} /> : <>{ROLE_LABEL[u.role]}<span className="ml-2 text-ink-dim">{ROLE_DUTY[u.role]}</span></>}
          </InfoRow>
          {editing && (
            <>
              <InfoRow icon="check" label="상태"><Switch checked={active} disabled={fixed} onChange={setActive} label={active ? "활성" : "정지"} /></InfoRow>
              <InfoRow icon="lock" label="비밀번호">
                <div className="flex gap-2">
                  <input className={rowInput} type="password" autoComplete="new-password" placeholder="임시 비밀번호" aria-label="임시 비밀번호" value={temp} onChange={(e) => setTemp(e.target.value)} />
                  <button type="button" className={cn(actionButton, "h-8 flex-none px-3 text-[12.5px]")} onClick={() => void onReset()}>초기화</button>
                </div>
              </InfoRow>
            </>
          )}
          <InfoRow icon="calendar" label="계정 생성일"><span className="tabular-nums">{stamp(u.created_at)}</span></InfoRow>
        </GroupBox>
        {lockText && <p className={cn(note, "flex items-center gap-1")}><Icon name="lock" small />{lockText}</p>}
        {editing && <EditActions onCancel={() => setMode("view")} />}
      </form>
    </Panel>
  );
}
