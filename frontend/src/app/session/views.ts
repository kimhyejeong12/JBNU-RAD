import type { Role } from "@/shared/api/types";
import type { StageFilter } from "@/app/ui/state/uiReducer";

export type MainTab = "queue" | "nodes" | "logs" | "ask" | "stats" | "ustats";
export type View = "requests" | "policies" | "stats" | "qa" | "events" | "mine" | "users" | "access" | "docs";
export type ItemType = "req" | "server" | "user" | "access" | "policy" | "event" | "doc";

// 사이드바 구역 — 결재 · 보안 운영. 관리 메뉴(보안 총책임자)는 구역 대신 사이드바 아래 [관리] 하나로 묶습니다.
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

// 메뉴마다 쓰는 탭 · 목록 칸만 둡니다. 정책 질의 · 로그 질의는 그 메뉴의 기능이라 정책 관리 · 로그 감시에만 있습니다.
export const VIEWS: Record<View, ViewMeta> = {
  requests: { group: "결재", label: "권한 신청", icon: "lock", tip: "권한 신청",
              tabs: ["queue"], cols: ["번호", "신청자", "신청 권한", "신청 시각", "AI 판정"], search: "신청 번호 · 신청자 · 권한으로 검색" },
  policies: { group: "보안 운영", title: "정책 관리 현황", label: "정책 관리", icon: "server", tip: "정책 관리",
              tabs: ["queue", "nodes", "ask"], cols: ["분류", "대상", "상세 내용", "시간", "AI 판정"], search: "정책 ID · 서버 · 내용으로 검색" },
  stats: { group: "보안 운영", title: "통계", label: "통계", icon: "activity", tip: "통계",
           tabs: ["stats", "ustats"], cols: [], search: "" },
  qa: { group: "보안 운영", title: "정책 질의", label: "정책 질의", icon: "chat", tip: "정책 질의",
        tabs: ["ask"], cols: [], search: "" },
  events: { group: "보안 운영", title: "로그 감시 현황", label: "로그 감시", icon: "eye", tip: "로그 감시",
            tabs: ["queue", "logs", "ask"], cols: ["분류", "대상 사용자", "상세 내용", "시간", "AI 판정"], search: "사용자 · 내용으로 검색" },
  mine: { title: "내 신청 현황", label: "내 신청", icon: "file", tip: "내 신청",
          tabs: ["queue"], cols: [], search: "" },   // 목록은 features/requests/MineList 가 따로 그립니다
  users: { title: "계정 목록", label: "계정 관리", icon: "users", tip: "계정 관리",
           tabs: ["queue"], cols: ["역할", "이름 (아이디)", "부서", "마지막 로그인", "상태"], search: "이름 · 아이디 · 부서로 검색" },
  access: { title: "권한 목록", label: "권한 목록", icon: "key", tip: "권한 목록",
            tabs: ["queue"], cols: ["시스템", "권한 (코드)", "분류 · 설명", "고친 시각", "상태"], search: "권한 이름 · 코드 · 시스템으로 검색" },
  docs: { title: "기준 문서", label: "기준 문서", icon: "book", tip: "기준 문서",
          tabs: ["queue"], cols: ["분류", "문서", "파일", "고친 시각", "조항"], search: "문서 이름 · 내용으로 검색" },
};

// 보안 총책임자는 보안 운영자와 같은 메뉴에 권한 목록 · 계정 관리를 더합니다. 기준 문서는 둘 다 — 보안 운영자는 읽기만(올리기 · 고치기 없음).
export const ROLE_VIEWS: Record<Role, View[]> = {
  user: ["mine"],
  manager: ["requests", "policies", "events", "stats", "qa", "docs"],
  top: ["requests", "policies", "events", "stats", "qa", "access", "users", "docs"],
};
// 관리 — 매일 처리하는 일이 아니라 시스템 설정이라 사이드바에는 [관리] 하나로 두고, 들어가면 탭 줄로 셋을 오갑니다.
const ADMIN_VIEWS: readonly View[] = ["access", "users", "docs"];
export const isAdminView = (v: View | null): boolean => v !== null && ADMIN_VIEWS.includes(v);
export const RESULT_VIEWS: ReadonlySet<View> = new Set<View>(["policies", "events"]);
export const LEVEL_VIEWS: ReadonlySet<View> = new Set<View>(["requests", "policies", "events"]);
export const TYPE_VIEW: Record<ItemType, View> = { req: "requests", server: "policies", user: "users", access: "access", policy: "policies", event: "events", doc: "docs" };
export const TYPE_LABEL: Record<ItemType, string> = { req: "권한 신청", server: "서버 점검", user: "계정", access: "권한", policy: "정책 관리", event: "로그 감시", doc: "기준 문서" };

export interface DataNeeds { operator: boolean; requests: boolean; mine: boolean; users: boolean; catalog: boolean; results: boolean }

// 역할마다 받을 데이터 — 메뉴가 없는 역할에는 요청하지 않습니다 (일반 사용자에게는 엔진 상태도 묻지 않습니다).
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

// 사이드바 — 역할 메뉴를 구역별로 묶습니다 (메뉴 순서 그대로, 구역 없는 메뉴는 빼고).
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

// 새로고침 뒤 돌아갈 마지막 화면 — 메뉴 · 탭 · 결재 단계 · 관리의 마지막 탭.
export interface SavedPage { view: View; mainTab: MainTab; stageFilter: StageFilter; lastAdmin: View | null }

// 저장된 값이 이 역할의 메뉴 · 탭에 있을 때만 씁니다 (계정이 바뀌었거나 메뉴가 바뀌었으면 null → 첫 메뉴).
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

// 사이드바를 처음에 펼칠지 — 1440px 이상이면 펼쳐도 목록(최소 760px) · 오른쪽 패널(430px)이 들어갑니다.
export const defaultNavWide = (width: number): boolean => width >= 1440;
