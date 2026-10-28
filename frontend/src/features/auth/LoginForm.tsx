import { useRef, useState, type FormEvent } from "react";
import { login } from "./api";
import { errorText } from "@/shared/api/http";
import { Icon } from "@/shared/ui/Icon";

export function LoginForm() {
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
