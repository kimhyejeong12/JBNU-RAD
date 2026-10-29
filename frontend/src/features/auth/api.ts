import { send } from "@/shared/api/http";

export const login = (login_id: string, password: string) => send("/api/auth/login", { login_id, password });

export const changePassword = (current: string, next: string) => send("/api/auth/password", { current, new: next });

// 로그아웃은 실패해도 화면을 다시 띄웁니다 (세션이 이미 끊긴 경우).
export async function logout(): Promise<void> {
  try {
    await send("/api/auth/logout");
  } finally {
    location.reload();
  }
}
