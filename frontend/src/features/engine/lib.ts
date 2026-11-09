export interface QueueJob {
  id: number;
  kind: string;
  key: string;
  status: string;
  auto: boolean;
  created_at: string;
  started_at: string | null;
  lane: number;
  close: boolean;
  batch: number | null;
}

export interface QueueBatch {
  id: number;
  kind: string;
  status: string;
  auto: boolean;
  done: number;
  total: number;
  created_at: string;
  started_at: string | null;
}

export interface QueueDetail {
  generation: number;
  current: QueueJob | null;
  lanes: { lane: number; name: string; jobs: QueueJob[] }[];
  batches: QueueBatch[];
  last: Record<string, { finished_at: string | null; error: string | null; auto: boolean }>;
  labels: Record<string, string>;
  schedule: Record<string, { every_min: number; next_at: string }>;
}

// 길마다 이만큼만 줄로 보이고 나머지는 건수로 줄입니다.
export const LANE_ROWS = 30;

export const jobName = (d: Pick<QueueDetail, "labels">, kind: string): string => d.labels[kind] ?? kind;

// 잡 key 는 "종류:대상" 이고, 권한 신청은 신청 번호 그대로, 재검토는 grant:신청 번호:이동 id 입니다.
export function jobTarget(j: Pick<QueueJob, "kind" | "key" | "close">): string {
  if (j.close) return "저장";
  if (j.kind === "request") return j.key;
  if (j.kind === "index") return "기준 문서";
  const [, ...rest] = j.key.split(":");
  if (j.kind === "grant") return rest.length === 2 ? `${rest[0]} (이동 ${rest[1]})` : j.key;
  return rest.join(":") || j.key;
}

export const waitingCount = (d: Pick<QueueDetail, "lanes">): number => d.lanes.reduce((n, l) => n + l.jobs.length, 0);

export function progress(d: Pick<QueueDetail, "batches">, j: QueueJob | null): string {
  const b = j?.batch != null ? d.batches.find((x) => x.id === j.batch) : undefined;
  return b ? `${b.done}/${b.total}` : "";
}

// 마지막 실행은 최근 것부터 봅니다.
export const lastRows = (d: Pick<QueueDetail, "last">): [string, QueueDetail["last"][string]][] =>
  Object.entries(d.last).sort(([, a], [, b]) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""));
