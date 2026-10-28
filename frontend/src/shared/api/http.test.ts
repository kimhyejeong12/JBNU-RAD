import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, getJSON, onUnauthorized, send } from "./http";

function respond(status: number, body: unknown, json = true): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 500 ? "Internal Server Error" : "",
    json: () => (json ? Promise.resolve(body) : Promise.reject(new Error("not json"))),
  } as unknown as Response;
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

test("성공이면 JSON 을 돌려주고 캐시를 쓰지 않는다", async () => {
  fetchMock.mockResolvedValue(respond(200, { a: 1 }));
  await expect(getJSON("/api/x")).resolves.toEqual({ a: 1 });
  expect(fetchMock).toHaveBeenCalledWith("/api/x", expect.objectContaining({ cache: "no-store" }));
});

test("401 이면 onUnauthorized 를 부르고 던진다", async () => {
  fetchMock.mockResolvedValue(respond(401, { detail: "로그인이 필요합니다" }));
  const cb = vi.fn();
  const off = onUnauthorized(cb);
  await expect(getJSON("/api/requests")).rejects.toThrow("로그인이 필요합니다");
  expect(cb).toHaveBeenCalledTimes(1);
  off();
});

test("로그인 URL 의 401 은 onUnauthorized 를 부르지 않는다", async () => {
  fetchMock.mockResolvedValue(respond(401, { detail: "아이디 또는 비밀번호가 틀렸습니다" }));
  const cb = vi.fn();
  const off = onUnauthorized(cb);
  await expect(send("/api/auth/login", { login_id: "a", password: "b" })).rejects.toThrow("아이디 또는 비밀번호가 틀렸습니다");
  expect(cb).not.toHaveBeenCalled();
  off();
});

test("detail 문자열을 오류 문장으로, 상태 코드는 ApiError 에", async () => {
  fetchMock.mockResolvedValue(respond(400, { detail: "이미 가진 권한입니다" }));
  const err = await getJSON("/api/requests").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(400);
  expect((err as ApiError).message).toBe("이미 가진 권한입니다");
});

test("detail 이 문자열이 아니면 '입력값을 확인하세요'", async () => {
  fetchMock.mockResolvedValue(respond(422, { detail: [{ loc: ["body", "question"] }] }));
  await expect(getJSON("/api/ask")).rejects.toThrow("입력값을 확인하세요");
});

test("본문이 JSON 이 아니면 상태 코드만", async () => {
  fetchMock.mockResolvedValue(respond(500, null, false));
  await expect(getJSON("/api/x")).rejects.toThrow("500 Internal Server Error");
});

test("send 는 JSON 본문과 Content-Type 을 보낸다 (본문 없으면 {})", async () => {
  fetchMock.mockResolvedValue(respond(200, {}));
  await send("/api/auth/logout");
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store",
  }));
  await send("/api/users/3", { name: "x" }, "PATCH");
  expect(fetchMock).toHaveBeenLastCalledWith("/api/users/3", expect.objectContaining({ method: "PATCH", body: '{"name":"x"}' }));
});
