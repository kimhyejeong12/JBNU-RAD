import { Fragment } from "react";
import { useUi } from "@/app/ui/state/UiContext";
import { useClauses } from "@/app/session/data";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/base/Icon";
import { chip, chipTone, chips, clause, note } from "@/shared/ui/base/styles";

export function SourceChips({ itemKey, sources, className }: { itemKey: string; sources?: string[] | null; className?: string }) {
  const { ui, toggleChip } = useUi();
  const clauses = useClauses();
  if (!sources?.length) return <p className={note}>모델이 근거 문서를 반환하지 않았습니다.</p>;
  return (
    <div className={cn(chips, className)}>
      {sources.map((s, n) => {
        const k = `${itemKey}#${n}`;
        const open = ui.expanded.has(k);
        return (
          <Fragment key={k}>
            <button className={cn(chip, chipTone(open))} aria-expanded={open} onClick={() => toggleChip(k)}>
              <Icon name="file" small /><span>{clauses.label(s)}</span>
              <span className="ml-auto whitespace-nowrap text-[11px] text-ink-dim">{open ? "접기" : "조항 전문"}</span>
            </button>
            {open && <div className={clause}>{clauses.text(s)}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}
