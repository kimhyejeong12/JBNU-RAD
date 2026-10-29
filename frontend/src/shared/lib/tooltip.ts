export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const GAP = 8;

// 툴팁 자리 — 아래 공간이 없으면 위로, 화면 가장자리 안쪽으로 막습니다.
export function placeTip(r: RectLike, pos: "bottom" | "right", tw: number, th: number, vw: number, vh: number): { left: number; top: number } {
  let x: number, y: number;
  if (pos === "right") {
    x = r.right + GAP + 2;
    y = r.top + r.height / 2 - th / 2;
  } else {
    x = r.left + r.width / 2 - tw / 2;
    y = r.bottom + GAP;
    if (y + th > vh - GAP) y = r.top - th - GAP;
  }
  return {
    left: Math.max(GAP, Math.min(x, vw - tw - GAP)),
    top: Math.max(GAP, Math.min(y, vh - th - GAP)),
  };
}
