import { expect, test } from "vitest";
import { initialUi, uiReducer, type UiState } from "./uiReducer";

const at = (patch: Partial<UiState>): UiState => ({ ...initialUi, ...patch });

test("NAVIGATE: 다른 메뉴로 가면 거르기 · 메시지 · 인용을 초기화하고 첫 항목을 고른다", () => {
  const s = uiReducer(at({ view: "requests", mainTab: "queue", filter: "위험", panelMsg: "✓", askSource: { i: 0, n: 0 }, query: "x" }),
    { type: "NAVIGATE", view: "policies", nextSelected: "policy:1" });
  expect(s).toMatchObject({ view: "policies", mainTab: "queue", filter: "전체", panelMsg: "", askSource: null, selected: "policy:1", query: "x" });
});

test("NAVIGATE: 같은 메뉴면 거르기를 유지한다", () => {
  const s = uiReducer(at({ view: "requests", filter: "위험", selected: "req:1" }), { type: "NAVIGATE", view: "requests", nextSelected: "req:1" });
  expect(s.filter).toBe("위험");
});

test("NAVIGATE: 검토 현황 탭이 없는 메뉴는 첫 탭으로", () => {
  expect(uiReducer(at({ view: "requests" }), { type: "NAVIGATE", view: "qa", nextSelected: null }).mainTab).toBe("ask");
  const stats = uiReducer(at({ view: "requests" }), { type: "NAVIGATE", view: "stats", nextSelected: null });
  expect(stats.mainTab).toBe("stats");
  expect(stats.stats.kind).toBe("stats");
});

test("NAVIGATE: 관리의 탭을 보면 기억하고, 다른 메뉴로 가도 잊지 않는다", () => {
  const users = uiReducer(at({ view: "access" }), { type: "NAVIGATE", view: "users", nextSelected: null });
  expect(users.lastAdmin).toBe("users");
  expect(uiReducer(users, { type: "NAVIGATE", view: "requests", nextSelected: null }).lastAdmin).toBe("users");
});

test("SELECT: 다른 항목을 고르면 메시지를 지우고, SELECT_SILENT 는 남긴다", () => {
  const base = at({ view: "requests", selected: "req:1", panelMsg: "✓ 승인했습니다" });
  expect(uiReducer(base, { type: "SELECT", key: "req:2", view: "requests" }).panelMsg).toBe("");
  expect(uiReducer(base, { type: "SELECT", key: "req:1", view: "requests" }).panelMsg).toBe("✓ 승인했습니다");
  expect(uiReducer(base, { type: "SELECT_SILENT", key: "req:2" })).toMatchObject({ selected: "req:2", panelMsg: "✓ 승인했습니다" });
});

test("SELECT: 다른 메뉴의 항목이면 메뉴를 바꾸고 검토 현황 탭으로", () => {
  const s = uiReducer(at({ view: "stats", mainTab: "ustats", filter: "위험" }), { type: "SELECT", key: "event:3", view: "events" });
  expect(s).toMatchObject({ view: "events", mainTab: "queue", selected: "event:3", filter: "전체" });
});

test("SET_MAIN_TAB: 탭을 바꾸면 인용 조항을 닫고, 통계 종류가 바뀌면 선택을 푼다", () => {
  const s = uiReducer(at({ view: "events", mainTab: "ask", askSource: { i: 1, n: 0 } }), { type: "SET_MAIN_TAB", tab: "logs" });
  expect(s).toMatchObject({ mainTab: "logs", askSource: null });
  const u = uiReducer(at({ view: "stats", mainTab: "stats", stats: { period: "week", kind: "stats", selected: { kind: "node", key: "a" } } }), { type: "SET_MAIN_TAB", tab: "ustats" });
  expect(u.stats).toEqual({ period: "week", kind: "ustats", selected: null });
});

test("SET_FILTER: 등급 거르기 버튼에서 고른 값으로 (전체 포함)", () => {
  expect(uiReducer(at({ filter: "전체" }), { type: "SET_FILTER", filter: "위험" }).filter).toBe("위험");
  expect(uiReducer(at({ filter: "위험" }), { type: "SET_FILTER", filter: "전체" }).filter).toBe("전체");
});

test("SET_STAGE_FILTER: 값과 첫 항목", () => {
  const s = uiReducer(at({ view: "requests", selected: "req:1" }), { type: "SET_STAGE_FILTER", value: "active", nextSelected: "req:9" });
  expect(s).toMatchObject({ stageFilter: "active", selected: "req:9" });
});

test("CLOSE_PANEL: 서랍을 닫고 탭별 선택을 푼다", () => {
  expect(uiReducer(at({ mainTab: "nodes", drawerOpen: true, nodes: { selected: "n1", adding: false } }), { type: "CLOSE_PANEL" }))
    .toMatchObject({ drawerOpen: false, nodes: { selected: null, adding: false } });
  expect(uiReducer(at({ mainTab: "logs", logs: { ...initialUi.logs, selected: 3 } }), { type: "CLOSE_PANEL" }).logs.selected).toBeNull();
  expect(uiReducer(at({ mainTab: "ask", askSource: { i: 0, n: 0 } }), { type: "CLOSE_PANEL" }).askSource).toBeNull();
  expect(uiReducer(at({ mainTab: "stats", stats: { ...initialUi.stats, selected: { kind: "node", key: "n1" } } }), { type: "CLOSE_PANEL" }).stats.selected).toBeNull();
  expect(uiReducer(at({ mainTab: "queue", selected: "req:1", drawerOpen: true }), { type: "CLOSE_PANEL" })).toMatchObject({ selected: "req:1", drawerOpen: false });
});

test("OPEN_LOGS: 로그 조회 탭에서 그 사용자의 최근 한 달", () => {
  const s = uiReducer(at({ view: "events", mainTab: "queue", logs: { period: "all", user: "x", solution: "DLP", how: "출력", page: 3, selected: 2 } }),
    { type: "OPEN_LOGS", cond: { user: "A 개발 박민수", period: "month" } });
  expect(s.mainTab).toBe("logs");
  expect(s.logs).toEqual({ period: "month", user: "A 개발 박민수", solution: "", how: "", page: 1, selected: null });
});

test("PICK_NODE · ADD_NODE · DESELECT 는 메시지를 지운다", () => {
  expect(uiReducer(at({ panelMsg: "x" }), { type: "PICK_NODE", name: "n1" })).toMatchObject({ panelMsg: "", nodes: { selected: "n1", adding: false } });
  expect(uiReducer(at({ panelMsg: "x", nodes: { selected: "n1", adding: false } }), { type: "ADD_NODE" })).toMatchObject({ panelMsg: "", nodes: { selected: null, adding: true } });
  expect(uiReducer(at({ panelMsg: "x", selected: "user:1" }), { type: "DESELECT" })).toMatchObject({ panelMsg: "", selected: null });
});

test("TOGGLE_CHIP: 펼친 칩을 넣고 뺀다", () => {
  const s = uiReducer(initialUi, { type: "TOGGLE_CHIP", key: "req:1:0" });
  expect(s.expanded.has("req:1:0")).toBe(true);
  expect(uiReducer(s, { type: "TOGGLE_CHIP", key: "req:1:0" }).expanded.has("req:1:0")).toBe(false);
});

test("NAVIGATE: 지금 탭이 새 메뉴에도 있으면 탭을 유지한다", () => {
  expect(uiReducer(at({ view: "policies", mainTab: "ask" }), { type: "NAVIGATE", view: "events", nextSelected: null }).mainTab).toBe("ask");
  expect(uiReducer(at({ view: "qa", mainTab: "ask" }), { type: "NAVIGATE", view: "policies", nextSelected: null }).mainTab).toBe("ask");
  expect(uiReducer(at({ view: "policies", mainTab: "nodes" }), { type: "NAVIGATE", view: "events", nextSelected: null }).mainTab).toBe("queue");
});

test("RESTORE: 새로고침 뒤 마지막 메뉴 · 탭 · 결재 단계 · 관리의 마지막 탭을 한 번에 되살린다", () => {
  const s = uiReducer(initialUi, { type: "RESTORE", view: "policies", mainTab: "nodes", stageFilter: "active", lastAdmin: "users", nextSelected: "server:a" });
  expect(s).toMatchObject({ view: "policies", mainTab: "nodes", stageFilter: "active", lastAdmin: "users", selected: "server:a" });
  expect(uiReducer(initialUi, { type: "RESTORE", view: "docs", mainTab: "queue", stageFilter: "pending", lastAdmin: null, nextSelected: null }).lastAdmin).toBe("docs");
});
