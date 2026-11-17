import type { QueueItem } from "@/app/queue/types";
import type { Regulation, RegulationIndex, XlsxTable } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

// index 를 받으면 조항 아래에 판정이 이 문서를 검색할 수 있는지 적음
export function docItem(d: Regulation, index?: RegulationIndex | null): QueueItem {
  const title = d.content.match(/^#\s+(.+)$/m)?.[1].trim() || d.name;
  const clauses = d.content.match(/^#{2,4}\s+\d+\.\d+/gm)?.length ?? 0;
  return {
    type: "doc", key: `doc:${d.name}`, id: "",
    who: title, what: d.name, when: stamp(d.updated_at), judge: clauses ? `${clauses}개` : "없음", raw: d,
    sub: index ? (index.chunks[d.name] ? "검색 가능" : "검색 안 됨") : undefined,
  };
}

export const isPdf = (name: string): boolean => /\.pdf$/i.test(name);
export const isXlsx = (name: string): boolean => /\.xlsx$/i.test(name);

// PDF, 엑셀은 글을 꺼내 .txt 로 올림
export const textName = (name: string): string => name.replace(/\.(pdf|xlsx)$/i, ".txt");

// 서버와 같은 조건임 (.md, .txt 1MB, .pdf, .xlsx 20MB, 같은 이름 없음)
export function uploadProblem(file: { name: string; size: number }, existing: string[]): string | null {
  if (isPdf(file.name)) {
    if (file.size > 20_000_000) return "PDF 는 20MB 까지 올릴 수 있습니다";
  } else if (isXlsx(file.name)) {
    if (file.size > 20_000_000) return "엑셀은 20MB 까지 올릴 수 있습니다";
  } else {
    if (!/\.(md|txt)$/i.test(file.name)) return ".md, .txt, .pdf, .xlsx 파일만 올릴 수 있습니다";
    if (file.size > 1_000_000) return "1MB 까지 올릴 수 있습니다";
  }
  if (existing.includes(textName(file.name))) return "같은 이름의 기준 문서가 있습니다. 다른 이름으로 올리세요";
  return null;
}

// PDF 에서 꺼낸 글을 올리기 전 확인임 (서버의 이름 조건과 같음)
export function draftProblem(draft: { name: string; content: string }, existing: string[]): string | null {
  const name = draft.name.trim();
  if (!/^[^./\\\0][^/\\\0]{0,95}\.(md|txt)$/i.test(name)) return "이름은 .md, .txt 로 끝나야 합니다 (/ 없이 100자까지)";
  if (existing.includes(name)) return "같은 이름의 기준 문서가 있습니다. 다른 이름으로 올리세요";
  if (!draft.content.trim()) return "빈 문서는 올릴 수 없습니다";
  return null;
}

export function editProblem(d: { name: string; content: string }, form: { content: string; reason: string; typed: string }): string | null {
  if (!form.content.trim()) return "빈 문서로 고칠 수 없습니다";
  if (form.content === d.content) return "바뀐 내용이 없습니다";
  if (!form.reason.trim()) return "고치는 사유를 적으세요";
  if (form.typed.trim() !== d.name) return "확인 칸에 파일 이름을 똑같이 입력하세요";
  return null;
}

export function removeProblem(d: { name: string }, count: number, form: { reason: string; typed: string }): string | null {
  if (count <= 1) return "마지막 기준 문서는 지울 수 없습니다. 새 문서를 먼저 올리세요";
  if (!form.reason.trim()) return "지우는 사유를 적으세요";
  if (form.typed.trim() !== d.name) return "확인 칸에 파일 이름을 똑같이 입력하세요";
  return null;
}

const firstLine = (v: string): string => {
  const line = v.split("\n")[0].trim();
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
};

// 고른 표를 조항 글로 씀 — 첫 칸이 같은 줄을 "## 번호." 로 묶고, 줄마다 "### 번호.번호" 조항 하나
export function tablesText(title: string, tables: XlsxTable[]): string {
  const out = [`# ${title}`];
  let n = 0;
  for (const t of tables) {
    out.push("", t.title, ...t.intro);
    const wide = t.columns.length > 2;
    const from = t.columns.length > 1 ? 1 : 0;
    // 같은 묶음에 같은 제목이 여럿이면 다음 칸의 첫 줄을 붙여 조항을 가림
    const seen = new Map<string, number>();
    t.rows.forEach(({ cells }) => seen.set(`${cells[0]}\n${cells[from]}`, (seen.get(`${cells[0]}\n${cells[from]}`) ?? 0) + 1));
    let group: string | null = null;
    let m = 0;
    for (const { cells, notes } of t.rows) {
      const g: string = t.columns.length > 1 ? cells[0] || group || "기타" : t.title;
      if (g !== group) {
        group = g;
        n += 1;
        m = 0;
        out.push("", `## ${n}. ${g}`);
      }
      m += 1;
      const twin = wide && (seen.get(`${cells[0]}\n${cells[from]}`) ?? 0) > 1 && firstLine(cells[2]);
      out.push("", `### ${n}.${m} ${[firstLine(cells[from]) || t.columns[from], twin].filter(Boolean).join(" ")}`);
      cells.forEach((v, i) => {
        if (i < (wide ? 2 : from) || !v) return;
        out.push(v.includes("\n") ? `${t.columns[i]}:\n${v}` : `${t.columns[i]}: ${v}`);
      });
      notes.forEach((note) => out.push(`메모 ${note}`));
    }
  }
  return out.join("\n") + "\n";
}
