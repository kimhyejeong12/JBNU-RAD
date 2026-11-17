import { useState, type FormEvent } from "react";
import { ChangeLog, Panel, PanelFoot, PanelMsg } from "@/app/ui/panel/Panel";
import { useHealth, useJobs, useRegulationIndex, useRegulations } from "@/app/session/data";
import { busyJob } from "@/shared/api/jobs";
import type { Regulation, XlsxTable } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { stamp } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { GroupBox, Meta, Section } from "@/shared/ui/parts";
import { actionButton, field, formActions, input, meta, note, panelActions, subject, dangerAction, noteError, primaryAction } from "@/shared/ui/styles";
import { noEnterSubmit } from "@/shared/lib/hooks";
import { useEditRegulation, useExtractPdf, useExtractXlsx, useRemoveRegulation, useUploadRegulation } from "./api";
import { docItem, draftProblem, editProblem, isPdf, isXlsx, removeProblem, tablesText, textName, uploadProblem } from "./lib";
import { ask } from "@/app/ui/ask";

// 다른 문서를 고르면 고치던 상태를 버리도록 문서 이름을 key 로 둡니다.
export function DocPanel({ d }: { d: Regulation | null }) {
  return d ? <DocView key={d.name} d={d} /> : <UploadDoc />;
}

function UploadDoc() {
  const upload = useUploadRegulation();
  const extract = useExtractPdf();
  const extractXlsx = useExtractXlsx();
  const busy = busyJob(useJobs());
  const names = useRegulations().map((r) => r.name);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState("");
  // PDF 에서 꺼낸 글은 사람이 보고 고친 뒤 올립니다.
  const [draft, setDraft] = useState<{ name: string; content: string; pages: number; empty: number[] } | null>(null);
  // 엑셀은 고른 표만 조항 글로 바꿉니다. 사람 기록 표는 처음에 빼 둡니다.
  const [sheet, setSheet] = useState<{ tables: XlsxTable[]; picked: boolean[] } | null>(null);
  const pending = extract.isPending || extractXlsx.isPending;

  function pick(tables: XlsxTable[], picked: boolean[], name: string) {
    setSheet({ tables, picked });
    setDraft({ name, content: tablesText(name.replace(/\.(md|txt)$/i, ""), tables.filter((_, i) => picked[i])), pages: 0, empty: [] });
  }

  function onPick(f: File | null) {
    setFile(f);
    setDraft(null);
    setSheet(null);
    extract.reset();
    extractXlsx.reset();
    const p = f ? uploadProblem(f, names) ?? "" : "";
    setProblem(p);
    if (f && !p && isPdf(f.name)) {
      extract.mutate(f, {
        onSuccess: (r) => setDraft({ name: textName(f.name), content: r.text, pages: r.pages, empty: r.empty_pages }),
        onError: (e) => setProblem(e.message),
      });
    }
    if (f && !p && isXlsx(f.name)) {
      extractXlsx.mutate(f, {
        onSuccess: (r) => pick(r.tables, r.tables.map((t) => !t.personal), textName(f.name)),
        onError: (e) => setProblem(e.message),
      });
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return setProblem("문서 파일을 고르세요");
    if (isPdf(file.name) || isXlsx(file.name)) {
      if (!draft) return setProblem(pending ? "글을 꺼내는 중입니다" : "글을 꺼내지 못했습니다. 파일을 다시 고르세요");
      const p = draftProblem(draft, names);
      if (p) return setProblem(p);
      upload.mutate({ name: draft.name.trim(), content: draft.content, source: file.name });
      return;
    }
    const p = uploadProblem(file, names);
    if (p) setProblem(p);
    else upload.mutate({ name: file.name, content: await file.text() });   // 올리면 새 문서가 골라져 이 양식은 닫힙니다
  }

  return (
    <Panel title="기준 문서 올리기">
    <form id="doc-upload" noValidate onKeyDown={noEnterSubmit} onSubmit={(e) => void onSubmit(e)}>
      <label className={field}>문서 파일 (.md, .txt, .pdf, .xlsx)
        <input className={input} type="file" accept=".md,.txt,.pdf,.xlsx" required
          onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      </label>
      {pending && <p className={note}>글을 꺼내는 중…</p>}
      {draft && (
        <div className="mt-3 flex flex-col gap-3">
          {sheet ? (
            <fieldset className={field}>
              <legend className="mb-1">올릴 표</legend>
              {sheet.tables.map((t, i) => (
                <label key={i} className="flex items-start gap-2 font-normal">
                  <input type="checkbox" className="mt-1" checked={sheet.picked[i]} onChange={(e) => pick(sheet.tables, sheet.picked.map((v, j) => (j === i ? e.target.checked : v)), draft.name)} />
                  <span className="min-w-0">
                    {t.title}
                    <span className={cn(meta, "block")}><Meta items={[t.sheet, `${t.rows.length}줄`, t.personal && "사람 기록"]} /></span>
                  </span>
                </label>
              ))}
              {sheet.picked.some((v, i) => v && sheet.tables[i].personal) && <p className={noteError}>사번, 이름이 든 표를 골랐습니다</p>}
            </fieldset>
          ) : <div className={meta}><Meta items={[`${draft.pages}쪽`, draft.empty.length > 0 && `글자 없는 쪽 ${draft.empty.join(", ")} (스캔본은 못 읽음)`]} /></div>}
          <label className={field}>저장할 이름
            <input className={input} value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className={field}>꺼낸 글
            <textarea className={cn(input, "resize-y font-normal")} rows={18} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
          </label>
        </div>
      )}
      {problem && <p className={noteError}>{problem}</p>}
      <div className={cn(formActions, "mt-3")}>
        <PanelMsg />
        <button type="submit" className={primaryAction} disabled={upload.isPending || pending}>{upload.isPending ? (busy ? `${busy} 끝나기를 기다리는 중…` : "올리는 중…") : "올리기"}</button>
      </div>
    </form>
    </Panel>
  );
}

function DocView({ d }: { d: Regulation }) {
  const it = docItem(d);
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const close = () => setMode("view");
  return (
    <Panel title="기준 문서" foot={<PanelFoot />}>
      <p className={subject}>{it.who}</p>
      <div className={meta}><Meta items={[d.name, d.updated_at && `고친 시각 ${stamp(d.updated_at)}`, `조항 ${it.judge}`]} /></div>
      {mode === "edit" ? <EditDoc d={d} onClose={close} /> : mode === "remove" ? <RemoveDoc d={d} onClose={close} /> : (
        <>
          <div className={panelActions}>
            <button type="button" className={actionButton} onClick={() => setMode("edit")}>수정</button>
            <button type="button" className={cn(actionButton, "text-risk")} onClick={() => setMode("remove")}>지우기</button>
          </div>
          <SearchState name={d.name} />
          <ChangeLog type="regulation" id={d.name} rev={d.updated_at ?? ""} />
          <Section icon="book" title="원문">
            <pre className="m-0 max-h-90 overflow-auto whitespace-pre-wrap rounded-lg bg-canvas px-3.5 py-3 text-[13px] font-[inherit]">{d.content.trim()}</pre>
          </Section>
        </>
      )}
    </Panel>
  );
}

// 판정이 이 문서를 근거로 찾을 수 있는지 — RAG 에 쌓인 조각 수와 판정 모델 (관리자가 올린 규정을 AI 가 쓴다는 것을 보입니다).
function SearchState({ name }: { name: string }) {
  const index = useRegulationIndex(true);
  const health = useHealth().data;
  const n = index?.chunks[name] ?? 0;
  const stored = !index ? "확인 중…" : n ? `벡터 DB에 적재됨 (조각 ${n}개)` : Object.keys(index.chunks).length ? "적재 안 됨" : "벡터 DB가 비었거나 닿지 않음";
  const used = !health ? "AI 엔진 확인 못 함" : health.ok ? `판정, 질의가 근거로 검색 (${health.model})` : "AI 엔진 준비 안 됨";
  return (
    <GroupBox icon="db" title="검색 상태 (AI 판정 근거)">
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
        <StateLine ok={n > 0}>{stored}</StateLine>
        <StateLine ok={!!health?.ok && n > 0}>{used}</StateLine>
      </ul>
    </GroupBox>
  );
}

const StateLine = ({ ok, children }: { ok: boolean; children: string }) => (
  <li className="flex items-center gap-1.5"><Icon name={ok ? "ok" : "warn"} small className={ok ? "text-ok" : "text-warn"} />{children}</li>
);

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
        <button type="submit" className={primaryAction} disabled={edit.isPending}>{edit.isPending ? (busy ? `${busy} 끝나기를 기다리는 중…` : "적재하는 중…") : "고치기"}</button>
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
        <button type="submit" className={dangerAction} disabled={remove.isPending}>{remove.isPending ? (busy ? `${busy} 끝나기를 기다리는 중…` : "지우는 중…") : "지우기"}</button>
      </div>
    </form>
  );
}
