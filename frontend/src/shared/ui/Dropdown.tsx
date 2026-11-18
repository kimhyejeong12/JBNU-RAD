import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Icon } from "@/shared/ui/Icon";

export interface DropOption {
  value: string;
  label: ReactNode;
  group?: string;
  disabled?: boolean;
}

// 브라우저 기본 고르기 상자 대신 직접 그린 목록 — 맥 기본 상자는 목록을 상자 위에 겹쳐 띄우고 줄 안 배치(오른쪽 끝 날짜 등)를 못 함
// group 이 있으면 그 이름 아래 묶고 들여 씀. small 은 낮은 상자용 작은 글, bare 는 화살표 없는 기호 단추(이름은 툴팁, 목록 폭은 listClass 로). 열려 있을 때 Esc 는 목록만 닫음 (질의 팝업의 Esc 보다 먼저 받음)
export function Dropdown({ id, options, value, onPick, shown, label, labelledBy, name, disabled, small, bare, className, buttonClass, listClass }: {
  id: string; options: DropOption[]; value: string; onPick: (value: string) => void; shown: ReactNode;
  label?: string; labelledBy?: string; name?: string; disabled?: boolean; small?: boolean; bare?: boolean; className?: string; buttonClass?: string; listClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const usable = options.flatMap((o, i) => (o.disabled ? [] : [i]));
  const picked = options.findIndex((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // 열면 고른 줄에, 없으면 고를 수 있는 첫 줄에 둠
  const show = () => { setActive(usable.includes(picked) ? picked : usable[0] ?? -1); setOpen(true); };
  const close = () => { setOpen(false); button.current?.focus(); };
  const choose = (i: number) => { if (usable.includes(i)) { onPick(options[i].value); close(); } };
  const step = (by: number) => {
    const at = usable.indexOf(active);
    const next = at < 0 ? (by > 0 ? 0 : usable.length - 1) : Math.min(usable.length - 1, Math.max(0, at + by));
    if (usable[next] != null) setActive(usable[next]);
  };
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => step(1), ArrowUp: () => step(-1),
      Home: () => setActive(usable[0] ?? -1), End: () => setActive(usable.at(-1) ?? -1),
      Enter: () => choose(active), " ": () => choose(active), Tab: () => setOpen(false),
    };
    if (!keys[e.key]) return;
    if (e.key !== "Tab") e.preventDefault();
    keys[e.key]();
  };

  const item = (o: DropOption, i: number) => (
    <li key={o.value} id={`${id}-${i}`} data-i={i} role="option" aria-selected={i === picked} aria-disabled={!!o.disabled}
      className={cn("cursor-pointer rounded-md px-2.5 aria-selected:font-bold aria-selected:text-brand", small ? "py-1.5" : "py-2", o.group && "pl-5",
        i === active && "bg-brand-soft", o.disabled && "cursor-default text-ink-faint")}
      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => !o.disabled && setActive(i)} onClick={() => choose(i)}>
      {o.label}
    </li>
  );
  const items = (group: string) => options.map((o, i) => ((o.group ?? "") === group ? item(o, i) : null));

  return (
    <div className={cn("relative", className)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button ref={button} type="button" id={id} name={name} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
        aria-label={label} aria-labelledby={labelledBy}
        className={cn(buttonClass, !bare && "w-full pr-9 text-left", "disabled:cursor-default", open && !bare && "border-brand ring-1 ring-brand")} data-tip={bare && !open ? label : undefined}
        // 사파리는 누른 단추에 포커스를 주지 않아, 열린 목록이 먼저 닫혔다가 이 클릭에 다시 열리지 않게 막음
        onMouseDown={(e) => { if (open) e.preventDefault(); }}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(); } }}>
        {bare ? shown : <span id={`${id}-value`} className="block truncate">{shown}</span>}
      </button>
      {!bare && <Icon name="chev" small className={cn("pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-dim transition-transform", open ? "-rotate-90" : "rotate-90")} />}
      {open && (
        <ul ref={list} id={`${id}-list`} role="listbox" tabIndex={-1} aria-label={label} aria-labelledby={labelledBy} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          className={cn("absolute top-full right-0 left-0 z-20 m-0 mt-1 max-h-72 list-none overflow-y-auto rounded-lg border border-line bg-surface p-1 font-normal text-ink shadow-[0_8px_24px_rgba(0,0,0,.12)] outline-none", small ? "text-[12.5px]" : "text-sm", listClass)}
          onKeyDown={onListKey}>
          {groups.map((g) => (g ? (
            <li key={g} role="presentation">
              <span className="block px-2.5 pt-2 pb-1 text-xs font-bold text-ink-dim">{g}</span>
              <ul role="group" aria-label={g} className="m-0 list-none p-0">{items(g)}</ul>
            </li>
          ) : items("")))}
        </ul>
      )}
    </div>
  );
}
