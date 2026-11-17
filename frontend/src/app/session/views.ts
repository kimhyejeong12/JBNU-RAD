import type { StageFilter } from "@/app/ui/state/uiReducer";
import type { Role } from "@/shared/api/types";

export type MainTab = "queue" | "nodes" | "logs" | "overview" | "risk" | "stats" | "ustats" | "engine";
export type View = "requests" | "policies" | "stats" | "events" | "mine" | "users" | "access" | "docs" | "jobs";
export type ItemType = "req" | "server" | "user" | "access" | "policy" | "event" | "doc";

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
  time?: false;   // 줄마다 시각이 같아 시간 열을 두지 않는 목록
  badge?: true;   // 셋째 칸이 배지인 목록 (계정 역할 · 권한의 업무 시스템)
}

export const VIEWS: Record<View, ViewMeta> = {
  requests: { group: "결재", label: "권한 신청", icon: "lock", tip: "권한 신청",
              tabs: ["queue"], cols: ["신청자", "신청 권한", "신청 시각", "AI 판단", "처리 상태"], search: "검색" },
  policies: { group: "보안 운영", title: "정책 관리 현황", label: "정책 관리", icon: "server", tip: "정책 관리",
              tabs: ["queue", "nodes"], cols: ["대상", "주요 문제", "AI 판단", "처리 상태"], search: "검색", time: false },
  stats: { group: "보안 운영", title: "보안 현황", label: "보안 현황", icon: "activity", tip: "보안 현황",
           tabs: ["overview", "risk", "stats", "ustats"], cols: [], search: "" },
  events: { group: "보안 운영", title: "로그 감시 현황", label: "로그 감시", icon: "eye", tip: "로그 감시",
            tabs: ["queue", "logs"], cols: ["사용자", "행위 요약", "발생 시각", "AI 판단", "처리 상태"], search: "검색" },
  mine: { title: "내 신청 현황", label: "내 신청", icon: "file", tip: "내 신청",
          tabs: ["queue"], cols: [], search: "" },
  users: { title: "계정 목록", label: "계정 관리", icon: "users", tip: "계정 관리",
           tabs: ["queue"], cols: ["이름", "부서, 직무", "역할", "마지막 로그인", "상태"], search: "이름, 부서, 역할", badge: true },
  access: { title: "권한 목록", label: "권한 목록", icon: "key", tip: "권한 목록",
            tabs: ["queue"], cols: ["권한", "분류, 설명", "업무 시스템", "고친 시각", "상태"], search: "권한, 시스템", badge: true },
  docs: { title: "기준 문서", label: "기준 문서", icon: "book", tip: "기준 문서",
          tabs: ["queue"], cols: ["문서", "파일", "고친 시각", "조항"], search: "검색" },
  jobs: { title: "큐", label: "큐", icon: "list", tip: "큐",
              tabs: ["engine"], cols: [], search: "" },
};

export const ROLE_VIEWS: Record<Role, View[]> = {
  user: ["mine"],
  manager: ["requests", "policies", "events", "stats", "access", "users", "docs", "jobs"],
  top: ["requests", "policies", "events", "stats", "access", "users", "docs", "jobs"],
};
// 로그인 뒤 첫 화면 — 보안 운영자는 처리할 결재, 보안 총책임자는 보안 현황 종합 대시보드
export const HOME: Record<Role, View> = { user: "mine", manager: "requests", top: "stats" };
const ADMIN_VIEWS: readonly View[] = ["access", "users", "docs", "jobs"];
export const isAdminView = (v: View | null): boolean => v !== null && ADMIN_VIEWS.includes(v);
export const RESULT_VIEWS: ReadonlySet<View> = new Set<View>(["policies", "events"]);
export const LEVEL_VIEWS: ReadonlySet<View> = new Set<View>(["requests", "policies", "events"]);
export const TYPE_VIEW: Record<ItemType, View> = { req: "requests", server: "policies", user: "users", access: "access", policy: "policies", event: "events", doc: "docs" };
export const TYPE_LABEL: Record<ItemType, string> = { req: "권한 신청", server: "서버 점검", user: "계정", access: "권한", policy: "정책 문제", event: "로그 감시", doc: "기준 문서" };

// 계정 관리는 보안 운영자, 루트는 처음 설정 · 비상용 — 서버 db/auth.py 와 같은 규칙
export const canManageAccounts = (me: { role: Role; is_root: boolean }): boolean => me.role === "manager" || me.is_root;

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
    stageFilter: p.stageFilter === "active" || p.stageFilter === "all" ? p.stageFilter : "pending",
    lastAdmin: admin ?? null,
  };
}

// compare.html 의 세 칸이 같은 저장소를 써서 계정별로 남김
const PREFIX = "sentinelai.page.";

export function readPage(loginId: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(PREFIX + loginId) ?? "null");
  } catch {
    return null;   // 저장소를 못 쓰거나 값이 망가졌으면 첫 메뉴로
  }
}

export function savePage(loginId: string, page: SavedPage): void {
  try {
    sessionStorage.setItem(PREFIX + loginId, JSON.stringify(page));
  } catch {
    // 남기지 못해도 이번 화면은 그대로임
  }
}

// 로그인 · 로그아웃도 새로고침으로 끝나 구별되지 않으므로 로그인에 성공하면 지움
export function forgetPages(): void {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch {
    // 저장소를 못 쓰면 남은 것도 없음
  }
}
