import type { QueueItem } from "./types";

const EMPTY: QueueItem[] = [];

// 메뉴마다 다른 데이터를 한 목록 형식으로 — 각 기능이 항목 변환 함수를 내놓고 여기서 모읍니다.
export function useQueue(): QueueItem[] {
  return EMPTY;
}
