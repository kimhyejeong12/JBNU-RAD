import { useRef, useState } from "react";
import type { NodeDetail, NodeRow } from "@/shared/api/types";
import { Section } from "@/shared/ui/Section";

// 내부망 서비스라 노드 키를 언제든 다시 보여줍니다. 해시만 남은 예전 키는 다시 발급해야 보입니다.
export function NodeKey({ n, d }: { n: NodeRow; d?: NodeDetail }) {
  const input = useRef<HTMLInputElement>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  if (!d || !n.key_issued) return null;
  if (!d.key) return <Section icon="lock" title="노드 키"><p className="note">예전 방식으로 발급해 볼 수 없는 키입니다. [키 다시 발급]을 하면 여기에 보입니다.</p></Section>;
  const cmd = `sudo sh node/install.sh --server ${location.origin} --key ${d.key}`;

  // 사내망의 http 화면에서는 클립보드 API 를 못 쓸 수 있어, 그때는 키 칸을 골라 둡니다 (Ctrl+C).
  async function copy(which: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setLabels((l) => ({ ...l, [which]: "복사했습니다" }));
    } catch {
      input.current?.focus();
      input.current?.select();
      setLabels((l) => ({ ...l, [which]: "Ctrl+C 로 복사하세요" }));
    }
  }

  return (
    <Section icon="lock" title="노드 키">
      <div className="key-box">
        <input id="issued-key" ref={input} readOnly value={d.key} aria-label="노드 키" />
        <p className="note">점검할 서버에서:</p>
        <div className="box pre">{cmd}</div>
        <div className="node-actions">
          <button className="rerun" onClick={() => copy("key", d.key!)}>{labels.key ?? "키 복사"}</button>
          <button className="rerun" onClick={() => copy("cmd", cmd)}>{labels.cmd ?? "설치 명령 복사"}</button>
        </div>
      </div>
    </Section>
  );
}
