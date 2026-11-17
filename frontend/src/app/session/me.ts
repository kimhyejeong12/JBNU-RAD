import { createContext, useContext } from "react";
import { ROLE_VIEWS, type View } from "./views";
import type { Me } from "@/shared/api/types";
import { send } from "@/shared/api/http";

export const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("MeContext 밖에서 useMe 를 불렀습니다");
  return me;
}

export const useViews = (): View[] => ROLE_VIEWS[useMe().role];

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

export const login = (login_id: string, password: string) => send("/api/auth/login", { login_id, password });

export const changePassword = (current: string, next: string) => send("/api/auth/password", { current, new: next });

// 세션이 이미 끊긴 경우를 위해 로그아웃은 실패해도 화면을 다시 띄움
export async function logout(): Promise<void> {
  try {
    await send("/api/auth/logout");
  } finally {
    location.reload();
  }
}
