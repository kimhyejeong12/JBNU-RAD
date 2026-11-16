import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
// 맥 · 윈도우에서 같은 글자가 나오게 폰트 파일을 빌드에 넣어 우리 서버가 줍니다 (외부망 없이).
import "@fontsource-variable/noto-sans-kr";
import "./app/styles.css";
import { startPageScale } from "./app/layout/pageScale";

startPageScale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
