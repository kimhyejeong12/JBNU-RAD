// 글자 · 간격이 px 이라 1920px 보다 넓은 창은 CSS zoom 으로 통째로 키웁니다 (vh 대신 --page-h).
const BASE_WIDTH = 1920;
const MAX_SCALE = 2;

export const scaleFor = (width: number): number => Math.min(MAX_SCALE, Math.max(1, width / BASE_WIDTH));

// 툴팁처럼 화면 좌표로 자리를 잡는 곳이 배율로 나눠 씁니다.
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
