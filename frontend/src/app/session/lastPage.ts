import type { SavedPage } from "./views";

// compare.html 의 세 칸이 같은 저장소를 써서 계정별로 남깁니다.
const PREFIX = "sentinelai.page.";

export function readPage(loginId: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(PREFIX + loginId) ?? "null");
  } catch {
    return null;   // 저장소를 못 쓰거나 값이 망가졌으면 첫 메뉴로
  }
}

export function savePage(loginId: string, page: SavedPage): void {
  try {
    sessionStorage.setItem(PREFIX + loginId, JSON.stringify(page));
  } catch {
    // 남기지 못해도 이번 화면은 그대로입니다.
  }
}

// 로그인 · 로그아웃도 새로고침으로 끝나 구별되지 않으므로 로그인에 성공하면 지웁니다.
export function forgetPages(): void {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch {
    // 저장소를 못 쓰면 남은 것도 없습니다.
  }
}
