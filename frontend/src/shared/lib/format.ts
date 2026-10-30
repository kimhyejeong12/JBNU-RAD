export const stamp = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("sv-SE", { hour12: false }).slice(0, 16) : "";

export const pct = (n: number, d: number): string => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export function niceMax(n: number): number {
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(n, 1))));
  return Math.ceil(n / step) * step;
}

// 결재 · 결정 기록의 사람 — "이름 (부서)", 부서가 없으면 이름만.
export const person = (name: string, department: string | null | undefined): string => (department ? `${name} (${department})` : name);
