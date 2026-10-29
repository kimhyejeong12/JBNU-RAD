import { Fragment } from "react";
import { useUi } from "@/app/ui/state/UiContext";
import { useClauses } from "@/app/session/data";
import { Icon } from "@/shared/ui/base/Icon";

// 근거 칩 — 누르면 기준 문서의 그 조항(또는 솔루션 정책 원본 행)을 아래에 펼칩니다. 펼친 상태는 항목 key 별로 둡니다.
export function SourceChips({ itemKey, sources }: { itemKey: string; sources?: string[] | null }) {
  const { ui, toggleChip } = useUi();
  const clauses = useClauses();
  if (!sources?.length) return <p className="note">모델이 근거 문서를 반환하지 않았습니다.</p>;
  return (
    <div className="chips">
      {sources.map((s, n) => {
        const k = `${itemKey}#${n}`;
        const open = ui.expanded.has(k);
        return (
          <Fragment key={k}>
            <button className="chip" aria-expanded={open} onClick={() => toggleChip(k)}>
              <Icon name="file" className="sm" /><span>{clauses.label(s)}</span><span className="open">{open ? "접기" : "조항 전문"}</span>
            </button>
            {open && <div className="clause">{clauses.text(s)}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}
