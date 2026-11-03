import type { QueueItem } from "@/app/queue/types";
import { PanelHead } from "@/app/ui/panel/Panel";
import { useUi } from "@/app/ui/state/UiContext";
import type { WatchFlag } from "@/shared/api/types";
import { LEVEL_ICON } from "@/shared/lib/labels";
import { KvTable, Section } from "@/shared/ui/base/parts";
import { Icon } from "@/shared/ui/base/Icon";
import { cn } from "@/shared/lib/cn";
import { box, levelText, meta, note, panelBody, recLine, subject, toolButton } from "@/shared/ui/base/styles";

type PersonItem = Extract<QueueItem, { type: "person" }>;

const KIND: Record<WatchFlag["kind"], string> = { leave: "퇴사", move: "이동", grant: "보유 권한", request: "결재 중 신청" };

// 확인할 사람 패널 — 퇴사 · 이동, 위험 · 주의인 신청 · 보유 권한을 한 사람 아래 모아 봅니다. 결재 · 회수는 [신청 보기]로 그 신청 패널에서 합니다.
export function PersonPanel({ it }: { it: PersonItem }) {
  const { setStageFilter, select } = useUi();
  const p = it.raw;
  // 신청은 확인할 사람 탭에 없으므로 [전체] 탭으로 옮긴 뒤 고릅니다.
  const open = (no: string) => {
    setStageFilter("all");
    select(`req:${no}`);
  };
  return (
    <>
      <PanelHead title="확인할 사람" />
      <div className={panelBody}>
        <p className={subject}>{p.name} ({p.login_id})</p>
        <div className={cn(recLine, levelText[p.level])}><Icon name={LEVEL_ICON[p.level]} className="size-5" />{p.level}</div>
        <div className={meta}>걸린 것 {p.flags.length}건 · 최근 {p.at}</div>
        <Section icon="users" title="계정">
          <KvTable rows={[
            ["부서", p.department || "—"],
            ["직무", p.job || "적지 않음"],
            ["상태", p.is_active ? "활성" : "정지"],
            ["퇴사일", p.left_on || "—"],
          ]} />
        </Section>
        <Section icon="warn" title="걸린 것">
          <ul className="grid gap-1.5">
            {p.flags.map((f, n) => (
              <li key={n} className={cn(box, "flex items-start gap-2")}>
                <Icon name={LEVEL_ICON[f.level]} className={cn("mt-0.5 size-4 shrink-0", levelText[f.level])} />
                <span className="min-w-0 flex-1">
                  <small className="block text-[11px] text-ink-faint">{KIND[f.kind]} · {f.at}{f.request_no ? ` · ${f.request_no}` : ""}</small>
                  {f.text}
                </span>
                {f.request_no && <button className={toolButton} onClick={() => open(f.request_no!)}>신청 보기</button>}
              </li>
            ))}
          </ul>
        </Section>
        <p className={note}>코드가 셈 — 퇴사일 · 이동 기록 · 신청과 보유 권한의 AI 판정 · 재검토에서. 회수 · 결재는 사람이 합니다.</p>
      </div>
    </>
  );
}
