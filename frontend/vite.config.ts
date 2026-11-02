import type { IncomingMessage } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { ProxyOptions } from "vite";
import { defineConfig } from "vitest/config";

// 개발 중에는 /api 를 `make dev`(8001)로 넘겨 쿠키 세션이 같은 출처처럼 동작합니다. /internal 은 화면이 쓰지 않습니다.
const API = "http://127.0.0.1:8001";

// 계정 비교 화면(compare.html)은 칸마다 로그인이 따로 있어야 하는데, 브라우저는 호스트마다 세션 쿠키를 하나만 둡니다.
// 그래서 칸 안 화면이 보낸 요청(Referer 에 ?as=칸)에는 개발 서버가 그 칸의 쿠키를 붙이고, 받은 쿠키는 브라우저 대신 칸에 보관합니다.
// 로그인 · 로그아웃은 평소 API 그대로 거치고, 개발 서버를 다시 띄우면 칸의 로그인은 사라집니다.
const jars = new Map<string, Map<string, string>>();

function slotJar(req: IncomingMessage): Map<string, string> | null {
  const slot = req.headers.referer ? new URL(req.headers.referer).searchParams.get("as") : null;
  if (!slot) return null;
  let jar = jars.get(slot);
  if (!jar) jars.set(slot, (jar = new Map()));
  return jar;
}

const slotSessions: ProxyOptions["configure"] = (proxy) => {
  proxy.on("proxyReq", (proxyReq, req) => {
    const jar = slotJar(req);
    if (!jar) return;
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) proxyReq.setHeader("cookie", cookie);
    else proxyReq.removeHeader("cookie");
  });
  proxy.on("proxyRes", (proxyRes, req) => {
    const jar = slotJar(req);
    if (!jar) return;
    for (const line of proxyRes.headers["set-cookie"] ?? []) {
      const pair = line.split(";")[0];
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      // 로그아웃은 빈 값 · Max-Age=0 으로 지웁니다.
      if (!value || value === '""' || /max-age=0\b/i.test(line)) jar.delete(name);
      else jar.set(name, value);
    }
    delete proxyRes.headers["set-cookie"];
  });
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": "/src" } },
  server: { port: 5173, strictPort: true, proxy: { "/api": { target: API, configure: slotSessions } } },
  preview: { proxy: { "/api": API } },
  // 빌드 결과는 서버가 그대로 서빙하는 sentinelai/web/static/ 에 둡니다 (root 밖이라 emptyOutDir 를 적어야 비웁니다). 옛 index.html 은 커밋 08b7d0f 바로 앞에 남아 있습니다.
  // compare.html 은 개발 서버에서만 씁니다 — 빌드 입력은 index.html 하나라 빌드에 들어가지 않습니다.
  build: { outDir: "../sentinelai/web/static", emptyOutDir: true, sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
