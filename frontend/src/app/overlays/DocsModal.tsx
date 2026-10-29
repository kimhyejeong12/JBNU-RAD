import { useRegulations } from "@/app/session/data";
import { cn } from "@/shared/lib/cn";
import { note } from "@/shared/ui/base/styles";

// 기준 문서 원문 — 사이드바의 책 아이콘. 배경 · × · Esc 로 닫습니다.
export function DocsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const regulations = useRegulations();
  return (
    <div id="docs-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={cn("fixed inset-0 z-40 items-center justify-center bg-[rgba(17,17,17,.4)] p-4", open ? "flex" : "hidden")}>
      <div className="max-h-[86vh] w-[min(820px,100%)] overflow-auto rounded-xl bg-surface px-[22px] py-5" role="dialog" aria-label="기준 문서 원문">
        <h3 className="m-0 mb-3 flex items-center text-[16px] font-bold">
          기준 문서 원문 <button id="docs-close" aria-label="닫기" onClick={onClose} className="ml-auto border-none bg-transparent px-1.5 py-px text-[20px] text-ink-dim">×</button>
        </h3>
        <div id="docs-body">
          {regulations.length
            ? regulations.map((d) => (
              <div className="mb-4" key={d.name}>
                <h4 className="m-0 mb-1.5 text-[13px] font-bold">{d.name}</h4>
                <pre className="m-0 whitespace-pre-wrap rounded-lg bg-canvas px-[14px] py-3 text-[13px] [font-family:inherit]">{d.content.trim()}</pre>
              </div>
            ))
            : <p className={note}>기준 문서를 불러오지 못했습니다.</p>}
        </div>
      </div>
    </div>
  );
}
