import type { Level } from "@/shared/api/types";

// 여러 화면이 같이 쓰는 모양 — 값은 옛 CSS 그대로입니다. 쓰는 곳에서 덮어쓸 때는 cn() 으로 합칩니다.

export const card = "rounded-xl border border-line bg-surface";
export const empty = "px-[18px] py-9 text-center text-ink-dim";
export const panelBody = "flex-1 overflow-auto px-[18px] py-4";
export const panelFoot = "border-t border-line bg-surface px-[18px] pt-[14px] pb-4";
export const panelFootTitle = "m-0 mb-[9px] text-[12.5px] font-bold";
export const subject = "m-0 mb-1 text-[15px] font-bold";
export const meta = "mx-0 mt-1 mb-0.5 text-[12px] text-ink-dim";
export const recLine = "flex items-center gap-[7px] text-[16px] font-extrabold tracking-[-0.3px]";
export const box = "rounded-lg bg-canvas px-[13px] py-[11px] text-[13.5px]";

// 고르기 칸 — 글꼴은 둘레 글자를 이어받고 크기만 13px (font 축약형은 크기 유틸리티와 순서가 엇갈릴 수 있어 나눠 씁니다).
export const select = "h-8 rounded-lg border border-line bg-surface px-2 text-[13px] [font-family:inherit] [font-weight:inherit] [line-height:inherit]";
// 입력 양식 — 두 칸(좁은 화면은 한 칸). 입력 칸은 둘레 글꼴을 이어받고 13.5px.
export const formGrid = "grid grid-cols-[1fr_1fr] gap-x-[14px] gap-y-[10px] px-[18px] pt-1 pb-4 narrow:grid-cols-[1fr]";
export const field = "flex flex-col gap-1 text-[12.5px] font-semibold text-ink-dim";
export const input = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13.5px] font-normal text-ink outline-none [font-family:inherit] [line-height:inherit] focus:border-ink disabled:bg-canvas disabled:text-ink-dim";
export const formActions = "flex items-center justify-end gap-2";
export const panelActions = "mt-2 flex gap-2";
export const actionButton = "h-9 rounded-lg border border-line bg-surface px-4 font-bold";
export const primaryButton = "border-ink bg-ink text-white";
export const dangerButton = "border-risk bg-risk text-white";
export const goodButton = "border-ok-line bg-ok-tint text-ok";

// 제목 줄의 작은 버튼 — 오른쪽으로 밀리고, 작업이 도는 동안(disabled) 회색.
export const toolButton = "ml-auto flex items-center gap-1.5 rounded-[7px] border border-line bg-surface px-[11px] py-1.5 text-[12.5px] font-semibold hover:border-ink-dim disabled:cursor-progress disabled:bg-canvas disabled:text-ink-dim";
export const note = "m-0 mt-1.5 text-[11.5px] text-ink-dim";

export const formMsg = "mr-auto text-[12.5px] text-risk";
export const formMsgOk = "mr-auto text-[12.5px] text-ok";

// 근거 칩 — 펼쳤거나 누른 칩은 주의 색, 아니면 hover 때만 테두리가 짙어집니다.
export const chips = "flex flex-col gap-1.5";
export const chip = "flex w-full items-center gap-[7px] rounded-lg border border-line bg-surface px-[11px] py-[7px] text-left text-[12.5px]";
export const chipTone = (on: boolean): string => (on ? "border-warn bg-warn-tint" : "hover:border-ink-dim");
export const clause = "mx-0 mt-[-2px] mb-1 rounded-r-[6px] border-l-[3px] border-warn bg-canvas px-3 py-[10px] text-[12.5px] whitespace-pre-wrap";

// 로그 · 통계 표
export const ltableWrap = "overflow-x-auto border-t border-line";
export const ltable = "w-full border-collapse text-[12.5px]";
export const lth = "whitespace-nowrap border-b border-line px-3 py-[9px] text-left font-semibold text-ink-dim";
export const ltd = "border-b border-line px-3 py-[9px] align-top";

// 등급 점 — 같은 색을 옅게 깐 3px 링. 등급이 없으면 회색.
export const levelDot: Record<Level | "none", string> = {
  "정상": "bg-ok shadow-[0_0_0_3px_rgba(46,125,91,.26)]",
  "주의": "bg-warn shadow-[0_0_0_3px_rgba(255,122,0,.26)]",
  "위험": "bg-risk shadow-[0_0_0_3px_rgba(234,0,44,.22)]",
  none: "bg-idle shadow-[0_0_0_3px_rgba(181,181,186,.26)]",
};

export const levelText: Record<Level, string> = { "정상": "text-ok", "주의": "text-warn", "위험": "text-risk" };

// 막대 조각 — 차트의 등급 색, 그 밖의 로그는 회색.
export type MarkKey = Level | "기타";
export const mark = "block flex-none";
export const markTone: Record<MarkKey, string> = { "위험": "bg-risk", "주의": "bg-warn", "정상": "bg-ok", "기타": "bg-mark-etc" };
