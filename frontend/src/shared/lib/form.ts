// 브라우저 기본 말풍선은 브라우저마다 모양 · 말이 달라 폼 옆 안내 글자로 알립니다.

// 받침이 있으면 을, 없으면 를 (한글이 아니면 을(를)).
export function eulReul(word: string): string {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return "을(를)";
  return (c - 0xac00) % 28 ? "을" : "를";
}

// * · 괄호 설명을 빼고, 줄표가 있으면 뒷부분을 칸 이름으로 씁니다.
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
