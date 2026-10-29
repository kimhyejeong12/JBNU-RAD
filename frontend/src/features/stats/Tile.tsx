import type { ReactNode } from "react";

export function Tile({ label, big, note, children }: { label: string; big: ReactNode; note: ReactNode; children?: ReactNode }) {
  return (
    <div className="tile">
      <span className="label">{label}</span>
      <span className="big">{big}</span>
      {children}
      <p className="note">{note}</p>
    </div>
  );
}
