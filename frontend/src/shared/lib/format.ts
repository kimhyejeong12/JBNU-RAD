export const stamp = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("sv-SE", { hour12: false }).slice(0, 16) : "";

export const pct = (n: number, d: number): string => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export function niceMax(n: number): number {
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(n, 1))));
  return Math.ceil(n / step) * step;
}

export const person = (name: string, department: string | null | undefined): string => (department ? `${name} (${department})` : name);

// "또한," 처럼 앞 문장을 잇는 문장은 앞 항목에 붙입니다.
const FOLLOWER = /^(또한|그리고|그러나|하지만|다만|따라서|그래서|이에|게다가|더불어|아울러|반면)[,\s]/;
const joinFollowers = (sentences: string[]): string[] =>
  sentences.reduce<string[]>((out, s) => (out.length && FOLLOWER.test(s) ? [...out.slice(0, -1), `${out[out.length - 1]} ${s}`] : [...out, s]), []);

// 모델 글을 항목으로 — 줄이 여럿이면 줄마다, 아니면 문장마다. "1. 소제목: 본문" 의 소제목은 label.
export function points(text: string): { label: string; text: string }[] {
  const plain = text.replace(/\*\*/g, "");   // 모델이 마크다운 굵게(**)를 섞어 씁니다
  const lines = plain.split("\n").map((l) => l.trim()).filter(Boolean);
  const parts = lines.length > 1 ? lines : joinFollowers(plain.trim().split(/(?<=[가-힣)\]"'」]\.)\s+/));
  return parts.map((p) => {
    const body = p.replace(/^(\d+[.)]|[-•*])\s+/, "");
    const m = body.match(/^([^:：.]{2,30})[:：]\s+(.+)$/s);
    return m ? { label: m[1].trim(), text: m[2].trim() } : { label: "", text: body };
  }).filter((p) => p.text);
}
