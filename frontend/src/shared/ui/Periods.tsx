// 기간 버튼 묶음 — 지금부터 거슬러 올라가는 기간을 고릅니다.
export function Periods<K extends string>({ id, labels, value, onChange }: { id: string; labels: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="periods" id={id} role="group" aria-label="기간">
      {labels.map(([k, label]) => (
        <button key={k} aria-pressed={k === value} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}
