// 필수 칸 안내 — 브라우저 기본 말풍선(브라우저마다 모양 · 말이 다름) 대신 폼 옆의 안내 글자로 무엇이 빠졌는지 알리고, 그 칸으로 커서를 옮깁니다.
// 폼은 noValidate 로 기본 말풍선을 끄고, 제출할 때 formProblem 을 부릅니다. 칸 이름은 라벨 글자에서 뽑습니다 (data-name 이 있으면 그것).

// 받침이 있으면 을, 없으면 를 (한글이 아니면 을(를)).
export function eulReul(word: string): string {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return "을(를)";
  return (c - 0xac00) % 28 ? "을" : "를";
}

// 라벨 글자 → 칸 이름: * · 괄호 설명을 빼고, 줄표가 있으면 뒷부분("비밀번호 초기화 — 임시 비밀번호" → 임시 비밀번호).
export function fieldName(label: string): string {
  const parts = label.replace(/\*/g, "").replace(/\(.*?\)/g, "").split("—");
  return (parts[parts.length - 1] ?? "").trim();
}

export type Problem = "missing" | "pattern" | "other";

export function problemText(name: string, kind: Problem, pick: boolean, hint?: string): string {
  if (kind === "missing") return `${name}${eulReul(name)} ${pick ? "고르세요" : "입력하세요"}`;
  if (kind === "pattern") return `${name} 형식을 확인하세요${hint ? ` — ${hint}` : ""}`;
  return `${name}${eulReul(name)} 확인하세요`;
}

// 폼에서 처음 걸리는 칸 — 커서를 옮기고 안내 글자를 돌려줍니다. 문제가 없으면 null. 형식 설명은 칸의 title 에서.
export function formProblem(form: HTMLFormElement): string | null {
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || el.validity.valid) continue;
    el.focus();
    const name = fieldName(el.dataset.name ?? el.closest("label")?.textContent ?? el.getAttribute("aria-label") ?? "");
    const kind: Problem = el.validity.valueMissing ? "missing" : el.validity.patternMismatch ? "pattern" : "other";
    const pick = el instanceof HTMLSelectElement || ["file", "date", "radio", "checkbox"].includes(el.type);
    return problemText(name, kind, pick, el.title || undefined);
  }
  return null;
}
