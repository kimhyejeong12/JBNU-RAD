import type { Role } from "@/shared/api/types";

export type MainTab = "queue" | "nodes" | "logs" | "ask" | "stats" | "ustats";
export type View = "requests" | "policies" | "stats" | "qa" | "events" | "mine" | "users" | "access";
export type ItemType = "req" | "server" | "mine" | "user" | "access" | "policy" | "event";

interface ViewMeta {
  title?: string;
  label: string;
  icon: string;
  tip: string;
  tabs: MainTab[];
  cols: string[];
  search: string;
}

// 메뉴마다 쓰는 탭 · 목록 칸만 둡니다. 정책 질의 · 로그 질의는 그 메뉴의 기능이라 정책 관리 · 로그 감시에만 있습니다.
export const VIEWS: Record<View, ViewMeta> = {
  requests: { label: "권한 신청", icon: "lock", tip: "권한 신청",
              tabs: ["queue"], cols: ["번호", "신청자", "신청 권한", "신청 시각", "AI 판정"], search: "신청 번호 · 신청자 · 권한으로 검색" },
  policies: { title: "정책 관리 현황", label: "정책 관리", icon: "server", tip: "정책 관리",
              tabs: ["queue", "nodes", "ask"], cols: ["분류", "대상", "상세 내용", "시간", "AI 판정"], search: "정책 ID · 서버 · 내용으로 검색" },
  stats: { title: "통계", label: "통계", icon: "activity", tip: "통계",
           tabs: ["stats", "ustats"], cols: [], search: "" },
  qa: { title: "정책 질의", label: "정책 질의", icon: "chat", tip: "정책 질의",
        tabs: ["ask"], cols: [], search: "" },
  events: { title: "로그 감시 현황", label: "로그 감시", icon: "eye", tip: "로그 감시",
            tabs: ["queue", "logs", "ask"], cols: ["분류", "대상 사용자", "상세 내용", "시간", "AI 판정"], search: "사용자 · 내용으로 검색" },
  mine: { title: "내 신청 현황", label: "내 신청", icon: "file", tip: "내 신청",
          tabs: ["queue"], cols: ["번호", "신청 권한", "사유", "신청 시각", "상태"], search: "신청 번호 · 권한으로 검색" },
  users: { title: "계정 목록", label: "계정 관리", icon: "users", tip: "계정 관리",
           tabs: ["queue"], cols: ["역할", "이름 (아이디)", "부서", "마지막 로그인", "상태"], search: "이름 · 아이디 · 부서로 검색" },
  access: { title: "권한 목록", label: "권한 목록", icon: "key", tip: "권한 목록",
            tabs: ["queue"], cols: ["시스템", "권한 (코드)", "분류 · 설명", "고친 시각", "상태"], search: "권한 이름 · 코드 · 시스템으로 검색" },
};

// 보안 총책임자는 보안 운영자와 같은 메뉴에 권한 목록 · 계정 관리를 더합니다.
export const ROLE_VIEWS: Record<Role, View[]> = {
  user: ["mine"],
  manager: ["requests", "policies", "events", "stats", "qa"],
  top: ["requests", "policies", "events", "stats", "qa", "access", "users"],
};
export const RESULT_VIEWS: ReadonlySet<View> = new Set<View>(["policies", "events"]);
export const LEVEL_VIEWS: ReadonlySet<View> = new Set<View>(["requests", "policies", "events"]);
export const TYPE_VIEW: Record<ItemType, View> = { req: "requests", server: "policies", mine: "mine", user: "users", access: "access", policy: "policies", event: "events" };
export const TYPE_LABEL: Record<ItemType, string> = { req: "권한 신청", server: "서버 점검", mine: "내 신청", user: "계정", access: "권한", policy: "정책 관리", event: "로그 감시" };

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
