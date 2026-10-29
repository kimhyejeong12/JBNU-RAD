import type { ReactNode } from "react";
import { statLabel } from "./lib";
import { cn } from "@/shared/lib/cn";
import { note as noteCls } from "@/shared/ui/base/styles";

export function Tile({ label, big, note, children }: { label: string; big: ReactNode; note: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[10px] border border-line px-3.5 py-3">
      <span className={statLabel}>{label}</span>
      <span className="text-[24px] font-extrabold tracking-[-0.6px] tabular-nums">{big}</span>
      {children}
      <p className={cn(noteCls, "m-0")}>{note}</p>
    </div>
  );
}
