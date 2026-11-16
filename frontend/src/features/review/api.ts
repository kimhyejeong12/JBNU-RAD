import type { QueueItem } from "@/app/queue/types";

export type ReviewItem = Extract<QueueItem, { type: "policy" | "server" | "event" }>;
