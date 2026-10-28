import type { ReactNode } from "react";

export function KvTable({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <div className="box">
      <table className="kv">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
