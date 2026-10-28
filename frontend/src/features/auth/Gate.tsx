import type { GateMode } from "./AuthContext";
import { LoginForm } from "./LoginForm";
import { PasswordForm } from "./PasswordForm";

export function Gate({ mode }: { mode: Exclude<GateMode, null> }) {
  return (
    <div className="gate" id="gate">
      {mode === "login" ? <LoginForm /> : <PasswordForm forced={mode === "password-forced"} />}
    </div>
  );
}
