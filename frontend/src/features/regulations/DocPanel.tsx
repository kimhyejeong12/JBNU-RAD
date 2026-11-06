import { useState, type FormEvent } from "react";
import { PanelFoot, PanelHead, PanelMsg } from "@/app/ui/panel/Panel";
import { useJobs, useRegulations } from "@/app/session/data";
import { useMe } from "@/app/session/me";
import { busyJob } from "@/shared/api/jobs";
import type { Regulation } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { stamp } from "@/shared/lib/format";
import { Meta, Section } from "@/shared/ui/base/parts";
import { actionButton, dangerButton, field, formActions, input, meta, note, panelActions, panelBody, primaryButton, subject } from "@/shared/ui/base/styles";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { useEditRegulation, useRemoveRegulation, useUploadRegulation } from "./api";
import { docItem, editProblem, removeProblem, uploadProblem } from "./lib";
import { ask } from "@/app/ui/confirm/ask";

// 다른 문서를 고르면 고치던 상태를 버리도록 문서 이름을 key 로 둡니다.
export function DocPanel({ d }: { d: Regulation | null }) {
  const top = useMe().role === "top";
  return d ? <DocView key={d.name} d={d} canEdit={top} /> : <UploadDoc />;
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
        <label className={field}>문서 파일 (.md, .txt)
          <input className={input} type="file" accept=".md,.txt" required
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setProblem(f ? uploadProblem(f, names) ?? "" : ""); }} />
        </label>
        {problem && <p className={cn(note, "text-risk")}>{problem}</p>}
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
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const close = () => setMode("view");
  return (
    <>
      <PanelHead title="기준 문서" />
      <div className={panelBody}>
        <p className={subject}>{it.who}</p>
        <div className={meta}><Meta items={[d.name, d.updated_at && `고친 시각 ${stamp(d.updated_at)}`, `조항 ${it.judge}`]} /></div>
        {mode === "edit" ? <EditDoc d={d} onClose={close} /> : mode === "remove" ? <RemoveDoc d={d} onClose={close} /> : (
          <>
            {canEdit && (
              <div className={panelActions}>
                <button type="button" className={actionButton} onClick={() => setMode("edit")}>수정</button>
                <button type="button" className={actionButton} onClick={() => setMode("remove")}>지우기</button>
              </div>
            )}
            <Section icon="book" title="원문">
              <pre className="m-0 whitespace-pre-wrap rounded-lg bg-canvas px-3.5 py-3 text-[13px] font-[inherit]">{d.content.trim()}</pre>
            </Section>
          </>
        )}
      </div>
      <PanelFoot />
    </>
  );
}

// 판정의 근거가 바뀌므로 사유와 파일 이름을 입력해야 버튼이 켜집니다.
function EditDoc({ d, onClose }: { d: Regulation; onClose: () => void }) {
  const edit = useEditRegulation();
  const busy = busyJob(useJobs());
  const [content, setContent] = useState(d.content);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const problem = editProblem(d, { content, reason, typed });
  const [tried, setTried] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (problem) return setTried(true);
    const message = `${d.name}을(를) 고칩니다. 다음 판정부터 새 내용을 씁니다.`;
    if (await ask({ title: "기준 문서 고치기", confirm: "고치기", message })) edit.mutate({ name: d.name, content, reason }, { onSuccess: onClose });
  }
  // 기다리는 중이면 고치기를 멈추고 쓰던 글은 남깁니다.
  async function onCancel() {
    if (!edit.isPending) return onClose();
    if (await edit.cancel(d)) onClose();
  }

  return (
    <form className="mt-3 flex flex-col gap-3" id="doc-edit" onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
      <label className={field}>원문
        <textarea className={cn(input, "resize-y")} rows={18} value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      <label className={field}>사유
        <input className={input} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="예: 매체 반출 조항 추가" />
      </label>
      <label className={field}>파일 이름 확인
        <input className={input} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} placeholder={d.name} />
      </label>
      {problem && <p className={cn(note, tried && "text-risk")}>{problem}</p>}
      {busy && !problem && <p className={note}>{busy} 끝난 뒤 적용됩니다.</p>}
      <div className={formActions}>
        <button type="button" className={actionButton} onClick={() => void onCancel()}>취소</button>
        <button type="submit" className={cn(actionButton, primaryButton)} disabled={edit.isPending}>{edit.isPending ? (busy ? `${busy} 끝나기를 기다리는 중…` : "적재하는 중…") : "고치기"}</button>
      </div>
    </form>
  );
}

function RemoveDoc({ d, onClose }: { d: Regulation; onClose: () => void }) {
  const remove = useRemoveRegulation();
  const busy = busyJob(useJobs());
  const count = useRegulations().length;
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [tried, setTried] = useState(false);
  const problem = removeProblem(d, count, { reason, typed });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (problem) return setTried(true);
    const message = `${d.name}을(를) 지웁니다. 다음 판정부터 근거에서 빠집니다.`;
    if (await ask({ title: "기준 문서 지우기", confirm: "지우기", danger: true, message })) remove.mutate({ name: d.name, reason });
  }

  return (
    <form className="mt-3 flex flex-col gap-3" id="doc-remove" onKeyDown={noEnterSubmit} onSubmit={onSubmit}>
      <label className={field}>지우는 사유 (감사 기록에 남습니다)
        <input className={input} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="예: 새 기준 문서로 바뀜" />
      </label>
      <label className={field}>확인 — 파일 이름을 똑같이 입력하세요
        <input className={input} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} placeholder={d.name} />
      </label>
      {problem && <p className={cn(note, (tried || count <= 1) && "text-risk")}>{problem}</p>}
      {busy && !problem && <p className={note}>{busy} 끝난 뒤 적용됩니다.</p>}
      <div className={formActions}>
        <PanelMsg />
        <button type="button" className={actionButton} onClick={onClose} disabled={remove.isPending}>취소</button>
        <button type="submit" className={cn(actionButton, dangerButton)} disabled={remove.isPending}>{remove.isPending ? (busy ? `${busy} 끝나기를 기다리는 중…` : "지우는 중…") : "지우기"}</button>
      </div>
    </form>
  );
}
