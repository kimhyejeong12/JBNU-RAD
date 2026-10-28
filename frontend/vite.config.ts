import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 개발 중에는 /api 를 `make dev`(8001)로 넘겨 쿠키 세션이 같은 출처처럼 동작합니다. /internal 은 화면이 쓰지 않습니다.
const API = "http://127.0.0.1:8001";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": "/src" } },
  server: { port: 5173, strictPort: true, proxy: { "/api": API } },
  preview: { proxy: { "/api": API } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
