import type { QueueItem } from "@/app/queue/types";
import type { Regulation } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";

export function docItem(d: Regulation): QueueItem {
  const title = d.content.match(/^#\s+(.+)$/m)?.[1].trim() || d.name;
  const clauses = d.content.match(/^#{2,4}\s+\d+\.\d+/gm)?.length ?? 0;
  return {
    type: "doc", key: `doc:${d.name}`, id: "",
    who: title, what: d.name, when: stamp(d.updated_at), judge: clauses ? `${clauses}개` : "없음", raw: d,
  };
}

// 서버와 같은 조건입니다 (.md · .txt, 1MB, 같은 이름 없음).
export function uploadProblem(file: { name: string; size: number }, existing: string[]): string | null {
  if (!/\.(md|txt)$/i.test(file.name)) return ".md, .txt 파일만 올릴 수 있습니다";
  if (file.size > 1_000_000) return "1MB 까지 올릴 수 있습니다";
  if (existing.includes(file.name)) return "같은 이름의 기준 문서가 있습니다. 다른 이름으로 올리세요";
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
