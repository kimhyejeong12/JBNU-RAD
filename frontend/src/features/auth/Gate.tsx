import { useRef, useState, type FormEvent } from "react";
import { type GateMode, useAuth } from "./AuthContext";
import { login, changePassword } from "./api";
import { errorText } from "@/shared/api/http";
import { Icon } from "@/shared/ui/base/Icon";

export function Gate({ mode }: { mode: Exclude<GateMode, null> }) {
  return (
    <div className="gate" id="gate">
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
    <form className="gate-card" id="login-form" autoComplete="on" onSubmit={onSubmit}>
      <div className="gate-logo"><Icon name="shield" />SentinelAI</div>
      <label>아이디<input name="login_id" autoComplete="username" required autoFocus /></label>
      <label>비밀번호<input ref={password} name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit" className="primary">로그인</button>
      <p className="form-msg" id="login-msg">{msg}</p>
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
    <form className="gate-card" id="pw-form" onSubmit={onSubmit}>
      <h3 id="pw-title">{forced ? "처음 로그인했습니다" : "비밀번호 변경"}</h3>
      <p className="note" id="pw-note">
        {forced ? "계속하려면 비밀번호를 바꾸세요. 루트가 준 임시 비밀번호는 더 쓸 수 없습니다." : "바꾸면 다른 곳에 로그인된 세션은 끊깁니다."}
      </p>
      <label>지금 비밀번호<input name="current" type="password" autoComplete="current-password" required autoFocus /></label>
      <label>새 비밀번호<input name="new" type="password" autoComplete="new-password" required /></label>
      <label>새 비밀번호 확인<input name="confirm" type="password" autoComplete="new-password" required /></label>
      <div className="form-actions">
        <span className="form-msg" id="pw-msg">{msg}</span>
        <button type="button" id="pw-cancel" hidden={forced} onClick={auth.hideGate}>취소</button>
        <button type="submit" className="primary">바꾸기</button>
      </div>
    </form>
  );
}
