import { useRef, useState } from "react";
import type { NodeDetail, NodeRow } from "@/shared/api/types";
import { Section } from "@/shared/ui/base/parts";
import { cn } from "@/shared/lib/cn";
import { boxPre, note, toolButton } from "@/shared/ui/base/styles";
import { nodeActions } from "./lib";

// 내부망 서비스라 노드 키를 언제든 다시 보여줍니다.
export function NodeKey({ n, d }: { n: NodeRow; d?: NodeDetail }) {
  const input = useRef<HTMLInputElement>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  if (!d || !n.key_issued) return null;
  if (!d.key) return <Section icon="lock" title="노드 키"><p className={note}>볼 수 없는 키입니다. [키 다시 발급]을 누르세요.</p></Section>;
  const cmd = `sudo sh node/install.sh --server ${location.origin} --key ${d.key}`;

  // 사내망 http 화면에서는 클립보드 API 를 못 쓸 수 있어 키 칸을 골라 둡니다.
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
      <div className="rounded-lg border border-line p-3">
        {/* font 축약형이 굵기 · 줄 높이도 normal 로 되돌리던 것과 같게 */}
        <input id="issued-key" ref={input} readOnly value={d.key} aria-label="노드 키"
          className="w-full rounded-md border border-line bg-surface px-2 py-1.75 text-[12.5px] font-normal text-black font-[ui-monospace,monospace] leading-[normal]" />
        <div className={boxPre}>{cmd}</div>
        <div className={cn(nodeActions, "mt-2")}>
          <button className={toolButton} onClick={() => copy("key", d.key!)}>{labels.key ?? "키 복사"}</button>
          <button className={toolButton} onClick={() => copy("cmd", cmd)}>{labels.cmd ?? "설치 명령 복사"}</button>
        </div>
      </div>
    </Section>
  );
}
