import type { Role } from "@/shared/api/types";
import type { StageFilter } from "@/app/ui/state/uiReducer";

export type MainTab = "queue" | "nodes" | "logs" | "risk" | "stats" | "ustats" | "engine";
export type View = "requests" | "policies" | "stats" | "events" | "mine" | "users" | "access" | "docs" | "jobs";
export type ItemType = "req" | "person" | "server" | "user" | "access" | "policy" | "event" | "doc";

export type NavGroup = "결재" | "보안 운영";

interface ViewMeta {
  title?: string;
  group?: NavGroup;
  label: string;
  icon: string;
  tip: string;
  tabs: MainTab[];
  cols: string[];
  search: string;
}

export const VIEWS: Record<View, ViewMeta> = {
  requests: { group: "결재", label: "권한 신청", icon: "lock", tip: "권한 신청",
              tabs: ["queue"], cols: ["신청자", "신청 권한", "신청 시각", "AI 판정"], search: "검색" },
  policies: { group: "보안 운영", title: "정책 관리 현황", label: "정책 관리", icon: "server", tip: "정책 관리",
              tabs: ["queue", "nodes"], cols: ["대상", "상세 내용", "시간", "AI 판정"], search: "검색" },
  stats: { group: "보안 운영", title: "보안 현황", label: "보안 현황", icon: "activity", tip: "보안 현황",
           tabs: ["risk", "stats", "ustats"], cols: [], search: "" },
  events: { group: "보안 운영", title: "로그 감시 현황", label: "로그 감시", icon: "eye", tip: "로그 감시",
            tabs: ["queue", "logs"], cols: ["대상 사용자", "상세 내용", "시간", "AI 판정"], search: "검색" },
  mine: { title: "내 신청 현황", label: "내 신청", icon: "file", tip: "내 신청",
          tabs: ["queue"], cols: [], search: "" },
  users: { title: "계정 목록", label: "계정 관리", icon: "users", tip: "계정 관리",
           tabs: ["queue"], cols: ["이름", "부서", "마지막 로그인", "상태"], search: "검색" },
  access: { title: "권한 목록", label: "권한 목록", icon: "key", tip: "권한 목록",
            tabs: ["queue"], cols: ["권한", "분류", "고친 시각", "상태"], search: "검색" },
  docs: { title: "기준 문서", label: "기준 문서", icon: "book", tip: "기준 문서",
          tabs: ["queue"], cols: ["문서", "파일", "고친 시각", "조항"], search: "검색" },
  jobs: { title: "큐", label: "큐", icon: "list", tip: "큐",
              tabs: ["engine"], cols: [], search: "" },
};

export const ROLE_VIEWS: Record<Role, View[]> = {
  user: ["mine"],
  manager: ["requests", "policies", "events", "stats", "docs"],
  top: ["requests", "policies", "events", "stats", "access", "users", "docs", "jobs"],
};
const ADMIN_VIEWS: readonly View[] = ["access", "users", "docs", "jobs"];
export const isAdminView = (v: View | null): boolean => v !== null && ADMIN_VIEWS.includes(v);
export const RESULT_VIEWS: ReadonlySet<View> = new Set<View>(["policies", "events"]);
export const LEVEL_VIEWS: ReadonlySet<View> = new Set<View>(["requests", "policies", "events"]);
export const TYPE_VIEW: Record<ItemType, View> = { req: "requests", person: "requests", server: "policies", user: "users", access: "access", policy: "policies", event: "events", doc: "docs" };
export const PEOPLE_COLS = ["사람", "걸린 것", "최근", "등급"];
export const TYPE_LABEL: Record<ItemType, string> = { req: "권한 신청", person: "확인할 사람", server: "서버 점검", user: "계정", access: "권한", policy: "정책 문제", event: "로그 감시", doc: "기준 문서" };

export interface DataNeeds { operator: boolean; requests: boolean; mine: boolean; users: boolean; catalog: boolean; results: boolean }

export function dataNeeds(role: Role): DataNeeds {
  const views = ROLE_VIEWS[role];
  const mine = views.includes("mine");
  return {
    operator: role !== "user",
    requests: views.includes("requests"),
    mine,
    users: views.includes("users"),
    catalog: views.includes("access") || mine,
    results: views.some((v) => RESULT_VIEWS.has(v)),
  };
}

export function navGroups(views: View[]): [NavGroup, View[]][] {
  const out: [NavGroup, View[]][] = [];
  for (const v of views) {
    const g = VIEWS[v].group;
    if (!g) continue;
    const last = out.find(([name]) => name === g);
    if (last) last[1].push(v);
    else out.push([g, [v]]);
  }
  return out;
}

export interface SavedPage { view: View; mainTab: MainTab; stageFilter: StageFilter; lastAdmin: View | null }

export function restorable(raw: unknown, role: Role): SavedPage | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Record<keyof SavedPage, unknown>>;
  const views = ROLE_VIEWS[role];
  const view = views.find((v) => v === p.view);
  if (!view) return null;
  const tabs = VIEWS[view].tabs;
  const admin = views.find((v) => v === p.lastAdmin && isAdminView(v));
  return {
    view,
    mainTab: tabs.find((t) => t === p.mainTab) ?? tabs[0],
    stageFilter: p.stageFilter === "active" || p.stageFilter === "all" || p.stageFilter === "people" ? p.stageFilter : "pending",
    lastAdmin: admin ?? null,
  };
}

// 1440px 이상이면 펼쳐도 목록(최소 760px) · 오른쪽 패널(430px)이 들어갑니다.
export const defaultNavWide = (width: number): boolean => width >= 1440;
