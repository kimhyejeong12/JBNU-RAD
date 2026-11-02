import type { SavedPage } from "./views";

// 새로고침 뒤 돌아갈 마지막 화면 — 이 탭에서만(sessionStorage) 계정별로 남깁니다. 새 탭 · 로그인 직후에는 첫 메뉴로 갑니다.
// 계정별인 까닭은 개발용 비교 화면(compare.html)의 세 칸이 같은 저장소를 써서입니다. 값은 views.restorable 이 걸러서 씁니다.
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
    // 남기지 못해도 이번 화면은 그대로입니다 (새로고침하면 첫 메뉴).
  }
}

// 로그인 직후 — 로그인 · 로그아웃도 새로고침으로 끝나 일반 새로고침과 구별이 안 되므로, 로그인에 성공하면 이 탭에 남은 마지막 화면을 지웁니다.
export function forgetPages(): void {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch {
    // 저장소를 못 쓰면 남은 것도 없습니다.
  }
}
