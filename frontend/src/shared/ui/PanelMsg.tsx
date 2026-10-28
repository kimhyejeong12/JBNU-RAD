// 패널 동작 결과 — "✓" 로 시작하면 완료(초록), 아니면 오류.
export function PanelMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className={msg.startsWith("✓") ? "form-msg ok" : "form-msg"}>{msg}</p>;
}
