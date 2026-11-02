import type { Level } from "@/shared/api/types";

// 여러 화면이 같이 쓰는 모양 — 값은 옛 CSS 그대로입니다. 쓰는 곳에서 덮어쓸 때는 cn() 으로 합칩니다.

export const card = "rounded-xl border border-line bg-surface";
export const empty = "px-4.5 py-9 text-center text-ink-dim";
export const panelBody = "flex-1 overflow-auto px-4.5 py-4";
export const panelFoot = "border-t border-line bg-surface px-4.5 pt-3.5 pb-4";
export const panelFootTitle = "m-0 mb-2.25 text-[12.5px] font-bold";
export const subject = "m-0 mb-1 text-[15px] font-bold";
export const meta = "mx-0 mt-1 mb-0.5 text-[12px] text-ink-dim";
export const recLine = "flex items-center gap-1.75 text-[16px] font-extrabold tracking-[-0.3px]";
export const box = "rounded-lg bg-canvas px-3.25 py-2.75 text-[13.5px]";
// 줄바꿈을 그대로 보이는 상자 (로그 줄 · 설치 명령 · 바뀐 설정)
export const boxPre = "rounded-lg bg-canvas px-3.25 py-2.75 whitespace-pre-wrap text-[12px] leading-[1.6]";

// 키 · 값 표 — 왼쪽 칸은 회색 이름(36%), 오른쪽 칸은 줄바꿈을 지킵니다.
export const kvTable = "w-full border-collapse text-[12.5px]";
export const kvTh = "w-[36%] whitespace-nowrap py-1 pr-2.5 pl-0 text-left align-top font-semibold text-ink-dim";
export const kvTd = "whitespace-pre-line px-0 py-1 text-left align-top";

// 카드 제목 줄 — 제목 · 건수(오른쪽) · 버튼
export const cardHead = "flex flex-wrap items-center gap-2.5 px-4.5 pt-4 pb-2.5";
export const cardTitle = "m-0 text-[15.5px] font-bold";
export const cardCount = "ml-auto text-[12.5px] text-ink-dim tabular-nums";

// 고르기 칸 — 글꼴은 둘레 글자를 이어받고 크기만 13px (font 축약형은 크기 유틸리티와 순서가 엇갈릴 수 있어 나눠 씁니다). 글자는 브라우저 입력 칸 기본색(검정).
export const select = "h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-black font-[inherit] [font-weight:inherit] leading-[inherit]";
// 입력 양식 — 두 칸(좁은 화면은 한 칸). 입력 칸은 둘레 글꼴을 이어받고 13.5px.
export const formGrid = "grid grid-cols-[1fr_1fr] gap-x-3.5 gap-y-2.5 px-4.5 pt-1 pb-4 narrow:grid-cols-[1fr]";
export const field = "flex flex-col gap-1 text-[12.5px] font-semibold text-ink-dim";
export const input = "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13.5px] font-normal text-ink outline-none font-[inherit] leading-[inherit] focus:border-ink disabled:bg-canvas disabled:text-ink-dim";
export const formActions = "flex items-center justify-end gap-2";
export const panelActions = "mt-2 flex gap-2";
export const actionButton = "h-9 rounded-lg border border-line bg-surface px-4 font-bold";
export const primaryButton = "border-ink bg-ink text-white";
export const dangerButton = "border-risk bg-risk text-white";
export const goodButton = "border-ok-line bg-ok-tint text-ok";

// 제목 줄의 작은 버튼 — 오른쪽으로 밀리고, 작업이 도는 동안(disabled) 회색.
export const toolButton = "ml-auto flex items-center gap-1.5 rounded-[7px] border border-line bg-surface px-2.75 py-1.5 text-[12.5px] font-semibold hover:border-ink-dim disabled:cursor-progress disabled:bg-canvas disabled:text-ink-dim";
export const note = "m-0 mt-1.5 text-[11.5px] text-ink-dim";

export const formMsg = "mr-auto text-[12.5px] text-risk";
export const formMsgOk = "mr-auto text-[12.5px] text-ok";

// 근거 칩 — 펼쳤거나 누른 칩은 주의 색, 아니면 hover 때만 테두리가 짙어집니다.
export const chips = "flex flex-col gap-1.5";
export const chip = "flex w-full items-center gap-1.75 rounded-lg border border-line bg-surface px-2.75 py-1.75 text-left text-[12.5px]";
export const chipTone = (on: boolean): string => (on ? "border-warn bg-warn-tint" : "hover:border-ink-dim");
export const clause = "mx-0 -mt-0.5 mb-1 rounded-r-md border-l-[3px] border-warn bg-canvas px-3 py-2.5 text-[12.5px] whitespace-pre-wrap";

// 로그 · 통계 표
export const ltableWrap = "overflow-x-auto border-t border-line";
export const ltable = "w-full border-collapse text-[12.5px]";
export const lth = "whitespace-nowrap border-b border-line px-3 py-2.25 text-left font-semibold text-ink-dim";
export const ltd = "border-b border-line px-3 py-2.25 align-top";
// 표의 빈 줄 안내 — 빈 화면 안내(empty)의 넓은 여백이 아니라 표 칸 여백 그대로, 가운데 정렬 (옛 화면 그대로).
export const ltdEmpty = `${ltd} text-center text-ink-dim`;
// 표의 줄 — 고른 줄은 hover 보다 고른 색이 이깁니다.
export const lrowTone = (current: boolean): string => (current ? "cursor-pointer bg-warn-tint" : "cursor-pointer hover:bg-canvas");

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
