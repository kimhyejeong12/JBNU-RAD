import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 개발 중에는 /api 를 `make dev`(8001)로 넘겨 쿠키 세션이 같은 출처처럼 동작합니다. /internal 은 화면이 쓰지 않습니다.
const API = "http://127.0.0.1:8001";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": "/src" } },
  server: { port: 5173, strictPort: true, proxy: { "/api": API } },
  preview: { proxy: { "/api": API } },
  // 빌드 결과는 서버가 그대로 서빙하는 sentinelai/web/static/ 에 둡니다 (root 밖이라 emptyOutDir 를 적어야 비웁니다). 옛 index.html 은 커밋 08b7d0f 바로 앞에 남아 있습니다.
  build: { outDir: "../sentinelai/web/static", emptyOutDir: true, sourcemap: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
