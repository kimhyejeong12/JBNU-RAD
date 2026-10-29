import { useRef, useState, type FormEvent } from "react";
import { type GateMode, useAuth } from "./AuthContext";
import { login, changePassword } from "./api";
import { errorText } from "@/shared/api/http";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { actionButton, field, formActions, formMsg, input, note, primaryButton } from "@/shared/ui/base/styles";

// 로그인 화면은 앱 위를 덮는 카드 하나입니다.
const CARD = "flex w-[min(380px,100%)] flex-col gap-3 rounded-[14px] border border-line bg-surface px-6 pt-[26px] pb-[18px]";

export function Gate({ mode }: { mode: Exclude<GateMode, null> }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-canvas p-4" id="gate">
      {mode === "login" ? <LoginForm /> : <PasswordForm forced={mode === "password-forced"} />}
    </div>
  );
}

function LoginForm() {
  const [msg, setMsg] = useState("");
  const password = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    const f = new FormData(e.currentTarget);
    try {
      await login(String(f.get("login_id")), String(f.get("password")));
      location.reload();
    } catch (err) {
      setMsg(errorText(err));
      if (password.current) password.current.value = "";
    }
  }

  return (
    <form className={CARD} id="login-form" autoComplete="on" onSubmit={onSubmit}>
      <div className="flex items-center gap-[9px] text-[20px] font-extrabold"><Icon name="shield" className="size-[26px] stroke-risk stroke-[2.2]" />SentinelAI</div>
      <label className={field}>아이디<input className={input} name="login_id" autoComplete="username" required autoFocus /></label>
      <label className={field}>비밀번호<input className={input} ref={password} name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit" className={cn(primaryButton, "h-10 rounded-lg border-none font-bold")}>로그인</button>
      <p className={cn(formMsg, "my-[1em]")} id="login-msg">{msg}</p>
    </form>
  );
}

// 첫 로그인 · 비밀번호 초기화 뒤에는 강제(취소 없음), 상단 바에서 열면 자발적 변경.
function PasswordForm({ forced }: { forced: boolean }) {
  const auth = useAuth();
  const [msg, setMsg] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = String(f.get("new"));
    if (next !== String(f.get("confirm"))) {
      setMsg("새 비밀번호 두 칸이 다릅니다");
      return;
    }
    try {
      await changePassword(String(f.get("current")), next);
      location.reload();
    } catch (err) {
      setMsg(errorText(err));
    }
  }

  return (
    <form className={CARD} id="pw-form" onSubmit={onSubmit}>
      <h3 id="pw-title" className="m-0 text-[17px] font-bold">{forced ? "처음 로그인했습니다" : "비밀번호 변경"}</h3>
      <p className={note} id="pw-note">
        {forced ? "계속하려면 비밀번호를 바꾸세요. 루트가 준 임시 비밀번호는 더 쓸 수 없습니다." : "바꾸면 다른 곳에 로그인된 세션은 끊깁니다."}
      </p>
      <label className={field}>지금 비밀번호<input className={input} name="current" type="password" autoComplete="current-password" required autoFocus /></label>
      <label className={field}>새 비밀번호<input className={input} name="new" type="password" autoComplete="new-password" required /></label>
      <label className={field}>새 비밀번호 확인<input className={input} name="confirm" type="password" autoComplete="new-password" required /></label>
      <div className={formActions}>
        <span className={formMsg} id="pw-msg">{msg}</span>
        <button type="button" id="pw-cancel" hidden={forced} onClick={auth.hideGate} className={actionButton}>취소</button>
        {/* 로그인 카드의 주 버튼이라 높이 40px · 테두리 없음 */}
        <button type="submit" className={cn(actionButton, primaryButton, "h-10 border-none")}>바꾸기</button>
      </div>
    </form>
  );
}
