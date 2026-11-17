import { Fragment } from "react";
import { useUi } from "@/app/ui/state/UiContext";
import { useClauses } from "@/app/session/data";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { clause, note } from "@/shared/ui/base/styles";

// 근거 조항 — 한 상자에 조항마다 한 줄(제목), 원문은 [원문]을 누를 때만.
export function SourceChips({ itemKey, sources, className }: { itemKey: string; sources?: string[] | null; className?: string }) {
  const { ui, toggleChip } = useUi();
  const clauses = useClauses();
  if (!sources?.length) return <p className={note}>모델이 근거 문서를 반환하지 않았습니다.</p>;
  return (
    <div className={cn("divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface", className)}>
      {sources.map((s, n) => {
        const k = `${itemKey}#${n}`;
        const open = ui.expanded.has(k);
        const head = clauses.head(s);
        return (
          <Fragment key={k}>
            <button className={cn("flex w-full items-center gap-1.75 border-0 bg-transparent px-2.75 py-1.5 text-left text-[12.5px] hover:bg-row-hover", open && "bg-warn-tint hover:bg-warn-tint")}
              aria-expanded={open} onClick={() => toggleChip(k)}>
              <Icon name="file" small />
              <span className="min-w-0 flex-1 truncate">{head ? <><span className="text-ink-dim">{head.doc}</span> <b>{head.title}</b></> : clauses.label(s)}</span>
              <span className="flex-none rounded border border-line bg-surface px-1.5 text-[11px] text-ink-soft">{open ? "접기" : "원문"}</span>
            </button>
            {open && <div className={cn(clause, "m-0 rounded-none")}>{clauses.text(s)}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}
