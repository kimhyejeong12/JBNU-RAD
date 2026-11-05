import type { IncomingMessage } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { ProxyOptions } from "vite";
import { defineConfig } from "vitest/config";

// /api 를 8001 로 넘겨 쿠키 세션이 같은 출처처럼 동작합니다.
const API = "http://127.0.0.1:8001";

// 브라우저는 호스트마다 세션 쿠키를 하나만 둬서 compare.html 의 칸(Referer 의 ?as=)마다 개발 서버가 쿠키를 따로 보관합니다.
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
  // root 밖이라 emptyOutDir 를 적어야 비웁니다.
  build: { outDir: "../sentinelai/web/static", emptyOutDir: true, sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
