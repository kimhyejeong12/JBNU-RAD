import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./app/styles.css";
import { startPageScale } from "./app/layout/pageScale";

// 큰 화면에서는 지금 비율 그대로 키웁니다 (로그인 화면 포함).
startPageScale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
