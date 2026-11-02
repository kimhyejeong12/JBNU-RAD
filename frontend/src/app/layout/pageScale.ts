// 큰 화면 비율 확대 — 창 폭이 기준(1920px)보다 넓으면 화면 전체를 그 비율만큼 키웁니다(최대 2배). 1920px 까지는 그대로라
// 큰 모니터 · 빔프로젝터에서도 지금 화면 비율이 그대로 커져 보입니다. 작은 화면은 칸이 줄고 접히는 반응형(narrow 1150 · phone 760)이 맡습니다.
// 글자 · 간격이 px 이라 CSS zoom 으로 통째로 키웁니다. 화면 높이를 쓰는 곳(body · 기준 문서 창)은 --page-h(화면 높이 ÷ 배율, px)를 씁니다 —
// vh 는 확대와 함께 커져 화면 밖으로 넘칠 수 있어서.
const BASE_WIDTH = 1920;
const MAX_SCALE = 2;

export const scaleFor = (width: number): number => Math.min(MAX_SCALE, Math.max(1, width / BASE_WIDTH));

// 지금 배율 — 툴팁처럼 화면 좌표로 자리를 잡는 곳이 나눠 씁니다.
export const pageScale = (): number => Number(document.body.style.zoom) || 1;

export function startPageScale(): void {
  const apply = () => {
    const z = scaleFor(innerWidth);
    const body = document.body.style;
    if (z > 1) {
      body.zoom = String(Math.round(z * 1000) / 1000);
      body.setProperty("--page-h", `${innerHeight / z}px`);
    } else {
      body.zoom = "";
      body.removeProperty("--page-h");
    }
  };
  apply();
  addEventListener("resize", apply);
}
