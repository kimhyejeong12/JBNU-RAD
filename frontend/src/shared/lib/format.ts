export const stamp = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("sv-SE", { hour12: false }).slice(0, 16) : "";

export const stampRange = (from: string | null | undefined, to: string | null | undefined): string => `${stamp(from)} ~ ${stamp(to)}`;

// 카드 머리 오른쪽 글 — 세는 중, 오류, 센 시작점
export function rangeText(q: { isFetching: boolean; error: Error | null; data?: { since?: string | null } }, lead = ""): string {
  if (q.isFetching) return "세는 중…";
  if (q.error) return q.error.message;
  if (!q.data) return "";
  return q.data.since ? `${lead}${stamp(q.data.since)} 부터` : `${lead}처음부터`;
}

// 날짜와 시각을 두 줄로 나눌 때 — 올해면 연도를 뺍니다 (예: ["11-17", "20:12"]).
export function dayTime(iso: string | null | undefined, now: Date = new Date()): [string, string] {
  const [day = "", time = ""] = stamp(iso).split(" ");
  return [day.startsWith(`${now.getFullYear()}-`) ? day.slice(5) : day, time];
}

// 쪽 번호는 지금 쪽을 가운데 두고 5개까지 — 줄이 많아도 쪽 번호 줄이 넘치지 않게 합니다.
export function pageLinks(at: number, pages: number, links = 5): number[] {
  const first = Math.max(1, Math.min(at - Math.floor(links / 2), pages - links + 1));
  return Array.from({ length: Math.min(links, pages) }, (_, i) => first + i);
}

// "✓" 로 시작하면 완료 글 (아니면 오류)
export const isDone = (msg: string): boolean => msg.startsWith("✓");

export const pct = (n: number, d: number): string => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export function niceMax(n: number): number {
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(n, 1))));
  return Math.ceil(n / step) * step;
}

// n 번째 칸 가운데의 가로 위치(%)
export const slotAt = (n: number, count: number) => ((n + 0.5) / count) * 100;

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
