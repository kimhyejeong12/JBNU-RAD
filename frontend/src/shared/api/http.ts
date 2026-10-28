// 세션이 끊기면(401) 어느 요청에서든 로그인 화면으로 돌아갑니다. 오류 문장은 서버가 준 것을 그대로 씁니다.

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(cb: () => void): () => void {
  unauthorizedListeners.add(cb);
  return () => {
    unauthorizedListeners.delete(cb);
  };
}

export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 401 && url !== "/api/auth/login") {
    unauthorizedListeners.forEach((cb) => cb());
    throw new ApiError(401, "로그인이 필요합니다");
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      msg = typeof body.detail === "string" ? body.detail : "입력값을 확인하세요";
    } catch {
      // 본문이 JSON 이 아니면 상태 코드만
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const send = <T>(url: string, body?: unknown, method = "POST"): Promise<T> =>
  getJSON<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
