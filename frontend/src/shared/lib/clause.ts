import type { Regulation } from "@/shared/api/types";

const docOf = (source: string, regulations: Regulation[]) => regulations.find((r) => source.includes(r.name));
const clauseNums = (source: string) => [...new Set(source.match(/\d+\.\d+/g) || [])];

export function clauseText(source: string, regulations: Regulation[]): string {
  const doc = docOf(source, regulations);
  if (!doc) return "기준 문서 원문에서 이 근거를 찾을 수 없습니다.";
  // 모델이 "[...md] 4.1, 4.2, 4.3" 처럼 여러 조항을 한 줄로 돌려주므로 전부 찾습니다.
  const lines = doc.content.split("\n");
  const heading = (i: number) => /^#{2,4}\s/.test(lines[i]);
  const blocks = clauseNums(source).map((num) => {
    const start = lines.findIndex((l, i) => heading(i) && l.includes(num));
    if (start < 0) return null;
    let end = start + 1;
    while (end < lines.length && !heading(end)) end++;
    return lines.slice(start, end).join("\n").trim();
  }).filter((b): b is string => !!b);
  if (!blocks.length) return doc.content.trim();   // 조항 번호가 없으면 문서 전문
  return `${doc.name}\n\n` + blocks.join("\n\n");
}

export function chipLabel(source: string, regulations: Regulation[]): string {
  const doc = docOf(source, regulations);
  const nums = clauseNums(source);
  const name = doc ? doc.name.replace(/\.md$/, "") : source.replace(/[[\]#]/g, "").trim();
  return nums.length ? `${name} ${nums.join(", ")}` : name;
}
