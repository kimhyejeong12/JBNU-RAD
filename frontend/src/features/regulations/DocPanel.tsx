import { useState, type FormEvent } from "react";
import { PanelFoot, PanelHead, PanelMsg } from "@/app/ui/panel/Panel";
import { useRegulations } from "@/app/session/data";
import type { Regulation } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { stamp } from "@/shared/lib/format";
import { Section } from "@/shared/ui/base/parts";
import { actionButton, field, formActions, input, meta, note, panelBody, primaryButton, subject } from "@/shared/ui/base/styles";
import { useUploadRegulation } from "./api";
import { docItem, uploadProblem } from "./lib";

// 기준 문서 패널 (보안 총책임자) — 선택 없음 = 문서 올리기, 고르면 원문. 지우기는 없습니다.
export function DocPanel({ d }: { d: Regulation | null }) {
  return d ? <DocView d={d} /> : <UploadDoc />;
}

function UploadDoc() {
  const upload = useUploadRegulation();
  const names = useRegulations().map((r) => r.name);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const p = uploadProblem(file, names);
    if (p) setProblem(p);
    else upload.mutate(file);   // 올리면 새 문서가 골라져 이 양식은 닫힙니다
  }

  return (
    <>
      <PanelHead title="기준 문서 올리기" />
      <form className={panelBody} id="doc-upload" onSubmit={onSubmit}>
        <label className={field}>문서 파일 (.md · .txt, 1MB 까지)
          <input className={input} type="file" accept=".md,.txt" required
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setProblem(f ? uploadProblem(f, names) ?? "" : ""); }} />
        </label>
        {problem && <p className={cn(note, "text-risk")}>{problem}</p>}
        <p className={note}>올리면 바로 AI 판정의 근거로 씁니다. 정책은 [정책 관리 검토 실행] 때 새 기준으로 다시 판정됩니다.</p>
        <div className={cn(formActions, "mt-3")}>
          <PanelMsg />
          <button type="submit" className={cn(actionButton, primaryButton)} disabled={!file || !!problem || upload.isPending}>{upload.isPending ? "올리는 중…" : "올리기"}</button>
        </div>
      </form>
    </>
  );
}

function DocView({ d }: { d: Regulation }) {
  const it = docItem(d);
  return (
    <>
      <PanelHead title="기준 문서" />
      <div className={panelBody}>
        <p className={subject}>{it.who}</p>
        <div className={meta}>{d.name}{d.updated_at ? ` · 고친 시각 ${stamp(d.updated_at)}` : ""} · 조항 {it.judge}</div>
        <Section icon="book" title="원문">
          <pre className="m-0 whitespace-pre-wrap rounded-lg bg-canvas px-3.5 py-3 text-[13px] font-[inherit]">{d.content.trim()}</pre>
        </Section>
      </div>
      <PanelFoot note="AI 판정의 근거로 쓰는 문서입니다." />
    </>
  );
}
