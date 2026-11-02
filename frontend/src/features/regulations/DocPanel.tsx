import { useState, type FormEvent } from "react";
import { PanelFoot, PanelHead, PanelMsg } from "@/app/ui/panel/Panel";
import { useJobs, useRegulations } from "@/app/session/data";
import { useMe } from "@/app/session/me";
import { busyJob } from "@/shared/api/jobs";
import type { Regulation } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { stamp } from "@/shared/lib/format";
import { Section } from "@/shared/ui/base/parts";
import { actionButton, empty, field, formActions, input, meta, note, panelActions, panelBody, primaryButton, subject } from "@/shared/ui/base/styles";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { useEditRegulation, useUploadRegulation } from "./api";
import { docItem, editProblem, uploadProblem } from "./lib";
import { ask } from "@/app/ui/confirm/ask";

// 기준 문서 패널 — 보안 총책임자는 선택 없음 = 문서 올리기, 고르면 원문 · [수정]. 보안 운영자는 읽기만(원문, 올리기 · 고치기 없음). 지우기는 없습니다.
// 다른 문서를 고르면 고치던 상태를 버리도록 문서 이름을 key 로 둡니다.
export function DocPanel({ d }: { d: Regulation | null }) {
  const top = useMe().role === "top";
  if (!d) return top ? <UploadDoc /> : <PickDoc />;
  return <DocView key={d.name} d={d} canEdit={top} />;
}

function PickDoc() {
  return (
    <>
      <PanelHead title="기준 문서" />
      <div className={panelBody}><div className={empty}>왼쪽 목록에서 문서를 고르면 원문을 봅니다.</div></div>
    </>
  );
}

function UploadDoc() {
  const upload = useUploadRegulation();
  const busy = busyJob(useJobs());
  const names = useRegulations().map((r) => r.name);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return setProblem("문서 파일을 고르세요");
    const p = uploadProblem(file, names);
    if (p) setProblem(p);
    else upload.mutate(file);   // 올리면 새 문서가 골라져 이 양식은 닫힙니다
  }

  return (
    <>
      <PanelHead title="기준 문서 올리기" />
      <form className={panelBody} id="doc-upload" noValidate onSubmit={onSubmit}>
        <label className={field}>문서 파일 (.md · .txt, 1MB 까지)
          <input className={input} type="file" accept=".md,.txt" required
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setProblem(f ? uploadProblem(f, names) ?? "" : ""); }} />
        </label>
        {problem && <p className={cn(note, "text-risk")}>{problem}</p>}
        <p className={note}>올리면 바로 AI 판정의 근거로 씁니다. 정책은 [정책 관리 검토 실행] 때 새 기준으로 다시 판정됩니다.</p>
        <div className={cn(formActions, "mt-3")}>
          <PanelMsg />
          <button type="submit" className={cn(actionButton, primaryButton)} disabled={upload.isPending}>{upload.isPending ? (busy ? `${busy} 끝나기를 기다리는 중…` : "올리는 중…") : "올리기"}</button>
        </div>
      </form>
    </>
  );
}

function DocView({ d, canEdit }: { d: Regulation; canEdit: boolean }) {
  const it = docItem(d);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <PanelHead title="기준 문서" />
      <div className={panelBody}>
        <p className={subject}>{it.who}</p>
        <div className={meta}>{d.name}{d.updated_at ? ` · 고친 시각 ${stamp(d.updated_at)}` : ""} · 조항 {it.judge}</div>
        {editing ? <EditDoc d={d} onClose={() => setEditing(false)} /> : (
          <>
            {canEdit && <div className={panelActions}><button type="button" className={actionButton} onClick={() => setEditing(true)}>수정</button></div>}
            <Section icon="book" title="원문">
              <pre className="m-0 whitespace-pre-wrap rounded-lg bg-canvas px-3.5 py-3 text-[13px] font-[inherit]">{d.content.trim()}</pre>
            </Section>
          </>
        )}
      </div>
      <PanelFoot note="AI 판정의 근거로 쓰는 문서입니다." />
    </>
  );
}

// 고치기 — 판정의 근거가 바뀌므로 사유를 적고 파일 이름을 똑같이 입력해야 버튼이 켜지고, 누르면 한 번 더 묻습니다.
// 결과 · 오류는 패널 아래 칸에 뜹니다.
function EditDoc({ d, onClose }: { d: Regulation; onClose: () => void }) {
  const edit = useEditRegulation();
  const busy = busyJob(useJobs());
  const [content, setContent] = useState(d.content);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const problem = editProblem(d, { content, reason, typed });
  const [tried, setTried] = useState(false);   // [고치기]를 눌렀는데 빠진 게 있으면 안내를 빨갛게

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (problem) return setTried(true);
    const message = `기준 문서 ${d.name} 내용을 고칩니다.\n\n`
      + "· 저장하면 이 문서를 바로 다시 적재하고, 앞으로의 AI 판정은 새 내용을 근거로 씁니다.\n"
      + "· 정책은 다음 [정책 관리 검토 실행] 때 새 기준으로 다시 판정됩니다.\n"
      + "· 고치기 전 원문과 사유는 감사 기록에 남습니다.";
    if (await ask({ title: "기준 문서 고치기", confirm: "고치기", message })) edit.mutate({ name: d.name, content, reason }, { onSuccess: onClose });
  }
  // 보내기 전이면 고치던 글을 버리고 닫습니다. 기다리는 중이면 고치기를 멈추고, 쓰던 글은 남깁니다 (이미 고쳐졌으면 닫음).
  async function onCancel() {
    if (!edit.isPending) return onClose();
    if (await edit.cancel(d)) onClose();
  }

  return (
    <form className="mt-3 flex flex-col gap-3" id="doc-edit" onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
      <label className={field}>원문
        <textarea className={cn(input, "resize-y")} rows={18} value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      <label className={field}>고치는 사유 (감사 기록에 남습니다)
        <input className={input} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="예: 출력 · 매체 반출 조항 추가" />
      </label>
      <label className={field}>확인 — 파일 이름을 똑같이 입력하세요
        <input className={input} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} placeholder={d.name} />
      </label>
      {problem && <p className={cn(note, tried && "text-risk")}>{problem}</p>}
      {/* AI 작업이 도는 동안에는 서버가 끝나기를 기다렸다가 바로 적용합니다 (다시 누르지 않아도 됨). */}
      {busy && !problem && <p className={note}>지금 AI 작업({busy})이 돌고 있어, 고치기를 누르면 끝나는 대로 바로 적용합니다.</p>}
      <div className={formActions}>
        <button type="button" className={actionButton} onClick={() => void onCancel()}>취소</button>
        <button type="submit" className={cn(actionButton, primaryButton)} disabled={edit.isPending}>{edit.isPending ? (busy ? `${busy} 끝나기를 기다리는 중…` : "적재하는 중…") : "고치기"}</button>
      </div>
    </form>
  );
}
