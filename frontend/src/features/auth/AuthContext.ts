import { createContext, useContext } from "react";

// 로그인 · 비밀번호 변경 게이트 — 로그인 전에는 화면 전체를 가립니다.
export type GateMode = "login" | "password" | "password-forced" | null;

export interface Auth {
  gate: GateMode;
  showLogin(): void;
  showPassword(forced: boolean): void;
  hideGate(): void;
}

export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthContext 밖에서 useAuth 를 불렀습니다");
  return auth;
}
