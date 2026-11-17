import type { Health, Jobs, Results } from "@/shared/api/types";
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

export function engineProblems(h: Health | null | undefined): string[] {
  if (!h) return ["서버에서 엔진 상태를 받지 못했습니다"];
  const out: string[] = [];
  if (!h.connected) out.push("Ollama 서버 연결 끊김");
  else {
    if (!h.model_ready) out.push(`판정 모델 없음 (${h.model})`);
    if (!h.qa_model_ready) out.push(`질답 모델 없음 (${h.qa_model})`);
    if (!h.embedding_ready) out.push(`임베딩 모델 없음 (${h.embedding_model})`);
  }
  if (!h.index_ready) out.push("기준 문서 인덱스 비어 있음");
  return out;
}

export function footerWarnings(r: Results, jobs: Jobs | null | undefined): string[] {
  const warns: string[] = [];
  if (r.summary.failed) warns.push(`판정 실패 ${r.summary.failed}건 — 해당 건은 '주의'로 기록되었습니다. 수동 검토가 필요합니다`);
  for (const sec of Object.values(r.sections || {})) {
    if (sec && sec.load_issues.length) warns.push(`${sec.source} 읽기 문제 ${sec.load_issues.length}건 — ${sec.load_issues[0]}`);
  }
  for (const [kind, last] of Object.entries(jobs?.last || {})) {
    if (last.error) warns.push(`${jobs?.kinds[kind]} 실패 — ${last.error}`);
  }
  return warns;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const GAP = 8;

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
