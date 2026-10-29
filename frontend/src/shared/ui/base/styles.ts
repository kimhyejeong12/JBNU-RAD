import type { Level } from "@/shared/api/types";

// 여러 화면이 같이 쓰는 모양 — 값은 옛 CSS 그대로입니다. 쓰는 곳에서 덮어쓸 때는 cn() 으로 합칩니다.

export const card = "rounded-xl border border-line bg-surface";
export const empty = "px-[18px] py-9 text-center text-ink-dim";
export const panelBody = "flex-1 overflow-auto px-[18px] py-4";
export const box = "rounded-lg bg-canvas px-[13px] py-[11px] text-[13.5px]";
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
