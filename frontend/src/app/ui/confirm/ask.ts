// 확인 창 띄우기 — 브라우저 기본 confirm() 대신 화면 디자인에 맞춘 가운데 창(ConfirmLayer)을 띄우고, 실행을 누르면 true.
// 버튼에는 하는 일을 그대로 씁니다([취소] [철회]). danger 면 실행 버튼이 빨강이고 처음 초점이 [취소]에 갑니다 (엔터로 바로 실행되지 않게).
export interface Ask { title: string; message: string; confirm: string; danger?: boolean }

type Show = (a: Ask, done: (ok: boolean) => void) => void;
let show: Show | null = null;

// ConfirmLayer 가 그려질 때 등록합니다.
export function registerConfirm(fn: Show | null): void {
  show = fn;
}

// 창이 아직 없으면(그리기 전) 브라우저 기본 창으로 대신합니다.
export function ask(a: Ask): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show(a, resolve);
    else resolve(window.confirm(`${a.title}\n\n${a.message}`));
  });
}
