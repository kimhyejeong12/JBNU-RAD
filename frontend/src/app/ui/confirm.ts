// danger 면 처음 초점을 [취소]에 두어 엔터로 바로 실행되지 않게 함
export interface Confirm { title: string; message: string; confirm: string; danger?: boolean }

type Show = (a: Confirm, done: (ok: boolean) => void) => void;
let show: Show | null = null;

export function registerConfirm(fn: Show | null): void {
  show = fn;
}

// 창이 아직 없으면(그리기 전) 브라우저 기본 창으로 대신함
export function confirmBox(a: Confirm): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show(a, resolve);
    else resolve(window.confirm(`${a.title}\n\n${a.message}`));
  });
}
