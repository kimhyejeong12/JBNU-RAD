import type { PolicyRow, Regulation } from "@/shared/api/types";

// 근거 조항 전문 — 판정의 sources 한 줄을 기준 문서 원문이나 솔루션 정책 원본 행으로 바꿉니다.

const docOf = (source: string, regulations: Regulation[]) => regulations.find((r) => source.includes(r.name));

// 모델이 ID 에 줄바꿈 없는 하이픈(FW‑002, U+2011) 같은 변형 문자를 쓰기도 해서 맞춰 비교합니다.
const plainDash = (s: string) => s.replace(/[‐-―−]/g, "-");
const isRule = (source: string) => /rules:/.test(source);
const clauseNums = (source: string) => [...new Set(source.match(/\d+\.\d+/g) || [])];

export const ruleIds = (source: string, policies: PolicyRow[]): string[] =>
  policies.map((p) => p.policy_id).filter((id) => plainDash(source).includes(id));

// 솔루션 정책 규칙 근거는 "rules:policies.csv (DLP-001, FW-001)" 처럼 옵니다. 언급된 정책 ID 의 원본 행을 보여줍니다.
export function ruleText(source: string, policies: PolicyRow[]): string {
  const ids = ruleIds(source, policies);
  const hit = policies.filter((p) => ids.includes(p.policy_id));
  const shown = hit.length ? hit : policies;
  if (!shown.length) return "정책 관리 검토를 돌리면 솔루션 정책 원본이 여기에 표시됩니다.";
  return shown.map((p) => `${p.policy_id} [${p.solution}] ${p.source} → ${p.destination} · ${p.service} · ${p.action} · 만료 ${p.expires_at || "없음"}`).join("\n");
}

export function clauseText(source: string, regulations: Regulation[], policies: PolicyRow[]): string {
  if (isRule(source)) return ruleText(source, policies);
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

export function chipLabel(source: string, regulations: Regulation[], policies: PolicyRow[]): string {
  if (isRule(source)) {
    const ids = ruleIds(source, policies);
    return `솔루션 정책${ids.length ? ` · ${ids.join(", ")}` : ""}`;
  }
  const doc = docOf(source, regulations);
  const nums = clauseNums(source);
  const name = doc ? doc.name.replace(/\.md$/, "") : source.replace(/[[\]#]/g, "").trim();
  return nums.length ? `${name} · ${nums.join(", ")}` : name;
}
