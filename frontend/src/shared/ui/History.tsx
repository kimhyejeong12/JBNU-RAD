export interface HistoryStep {
  title: string;
  who: string;
  when: string;
  say?: string | null;
}

// 결재 · 결정 기록 — 인라인 요소 사이의 공백을 지킵니다 (옛 화면의 줄바꿈이 공백으로 보였습니다).
export function History({ steps }: { steps: HistoryStep[] }) {
  return (
    <div className="box history">
      {steps.map((s, i) => (
        <div className="step" key={i}>
          <b>{s.title}</b>{" · "}{s.who}{" "}
          <span className="when">{s.when}</span>
          {s.say ? <>{" "}<span className="say">{s.say}</span></> : null}
        </div>
      ))}
    </div>
  );
}
