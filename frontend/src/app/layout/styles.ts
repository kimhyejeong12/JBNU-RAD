// 화면 틀이 여러 곳에서 쓰는 모양 (컴포넌트 파일에서 상수를 내보내면 빠른 새로고침이 깨져 따로 둡니다).

// 작업 공간 칸 — 목록과 오른쪽 패널(430px). 좁은 화면은 한 칸 (1fr 이라 넓은 표를 펼치면 칸이 표만큼 넓어집니다 — 옛 화면 그대로).
export const workspace = "grid min-h-0 grid-cols-[minmax(0,1fr)_430px] gap-[18px] px-[22px] pt-[18px] pb-[22px] narrow:grid-cols-[1fr] narrow:px-4 narrow:py-[14px]";
