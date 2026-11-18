import { expect, test } from "vitest";
import { EMPTY_RESULTS } from "@/shared/api/queries";
import type { EventFinding, Results, ServerFinding } from "@/shared/api/types";
import { compactLog, eventItems, logFacts, passItems, policyItems, policyTarget, serverItems } from "./lib";
import { DECISION_SET, decisionTone } from "@/app/ui/panel/decision";

const decision = { id: 1, kind: "event" as const, item_key: "k1", subject: "", action: "approve", comment: "", ai_level: "위험" as const,
  decider_id: 2, decider_name: "운영자", decider_department: "보안팀", decided_at: "2026-10-29T04:00:00+09:00" };
const event = (p: Partial<EventFinding>): EventFinding =>
  ({ key: "k1", id: "abc@2026-10-20", title: "A 개발 박민수", level: "위험", reason: "퇴근 뒤 출력", recommendation: "확인", sources: [],
    detail: { events: "", first_event_at: "", last_event_at: "" }, elapsed_sec: null, failed: false, stage: "final", ...p });
const server = (p: Partial<ServerFinding>): ServerFinding =>
  ({ key: "s1", id: "NODE-sim-01", title: "sim-01", level: "주의", reason: "요약", recommendation: "", sources: [], gaps: [], unjudged: [],
    detail: { snapshot: {} }, elapsed_sec: null, failed: false, ...p });

test("eventItems: 로그 줄 수 · 1차 판정 · 결정", () => {
  const r: Results = { ...EMPTY_RESULTS, events: [event({ detail: { events: "a\nb\n", first_event_at: "2026-10-20T18:00:00+09:00", last_event_at: "2026-10-20T18:30:00+09:00" }, stage: "fast" })], decisions: { event: { k1: decision } } };
  expect(eventItems(r)[0]).toMatchObject({
    type: "event", key: "event:k1", itemKey: "k1", id: "LOG-abc", level: "위험", judge: "위험",
    who: "A 개발 박민수", what: "로그 2건", note: "퇴근 뒤 출력", when: "2026-10-20 18:30", sub: "1차 판정", decision,
  });
  expect(eventItems({ ...EMPTY_RESULTS, events: [event({ stage: "final" })] })[0]).toMatchObject({ what: "로그 0건", note: "퇴근 뒤 출력", sub: "", decision: undefined });
});

test("serverItems: 다른 곳이 있으면 개수를 앞 글로", () => {
  const gap = { level: "위험" as const, item: "UFW", current: "inactive", required: "active", change: "ufw enable", source: "정책_운영기준.md 5.2" };
  const r: Results = { ...EMPTY_RESULTS, servers: [server({ gaps: [gap, gap] }), server({ key: "s2", id: "NODE-x" })], sections: { servers: { source: "nodes", generated_at: "2026-10-29T03:00:00+09:00", load_issues: [] } } };
  const [a, b] = serverItems(r);
  expect(a).toMatchObject({ type: "server", key: "server:s1", itemKey: "s1", id: "NODE-sim-01", lead: "불일치 2", what: "요약", when: "2026-10-29 03:00", judge: "주의" });
  expect(b).toMatchObject({ lead: undefined, what: "요약" });
});

test("policyItems: 번호 · 정책 쌍 · 유형", () => {
  const r: Results = { ...EMPTY_RESULTS, policy_review: { summary: "", elapsed_sec: null, passed: [], issues: [{ key: "p1", seq: 1, kind: "충돌", level: "위험", policy_ids: ["FW-004", "FW-005"], reason: "순서", recommendation: "r" }] },
    sections: { policies: { source: "data/policies", generated_at: "2026-10-29T03:00:00+09:00", load_issues: [] } } };
  expect(policyItems(r)[0]).toMatchObject({ type: "policy", key: "policy:p1", itemKey: "p1", id: "", typeLabel: "정책 문제", who: "FW-004 ↔ FW-005", lead: "충돌", what: "순서", when: "2026-10-29 03:00", judge: "위험" });
});

test("policyTarget: 조항 제목으로 줄이고 문서 이름은 한 번씩", () => {
  const regs = [{ name: "접근권한_관리기준.md", content: "# 접근 권한\n## 3. 원칙\n### 3.1 권한 부여 원칙\n최소\n### 3.2 인사 정보 접근\n인사팀", updated_at: "" }];
  expect(policyTarget(["접근권한_관리기준.md 3.1", "접근권한_관리기준.md 3.2"], regs)).toEqual({ who: "3.1 권한 부여 원칙 ↔ 3.2 인사 정보 접근", docs: "접근권한_관리기준" });
  // 원문에 없는 문서는 번호만, 문서 이름은 확장자를 떼고
  expect(policyTarget(["정책_운영기준.md 5.2"], regs)).toEqual({ who: "5.2", docs: "정책_운영기준" });
});

test("아무것도 돌리지 않은 서버는 세 목록이 모두 빈다", () => {
  expect(policyItems(EMPTY_RESULTS)).toEqual([]);
  expect(serverItems(EMPTY_RESULTS)).toEqual([]);
  expect(eventItems(EMPTY_RESULTS)).toEqual([]);
});

test("결정 버튼 표가 모든 버튼 색을 덮음", () => {
  const used = new Set(Object.values(DECISION_SET).flatMap((set) => Object.values(set)));
  expect(Object.keys(decisionTone).sort()).toEqual([...used].sort());
  expect(Object.values(DECISION_SET).every((set) => "done" in set)).toBe(true);
});

test("logFacts: 행위 · 위치별 수와 기간, 목록 행동 칸은 행위별 수", () => {
  const text = "- 2026-09-16 03:00:35 UTC [SecureMark] 재무 정다은(1.1.1.6) — VDI / 출력행위\n"
    + "- 2026-09-15 00:10:07 UTC [SecureMark] 재무 정다은(1.1.1.6) — PC / 출력행위 / PrintCount=3\n"
    + "- 2026-09-17 01:00:00 UTC [SecureMark] 재무 정다은(1.1.1.6) — PC / 조회";
  expect(logFacts(text)).toEqual({
    head: "[SecureMark] 재무 정다은(1.1.1.6)", first: "2026-09-15 09:10", last: "2026-09-17 10:00", count: 3,
    acts: [["출력행위", 2], ["조회", 1]], places: [["PC", 2], ["VDI", 1]],
  });
  expect(logFacts("a\nb")).toBeNull();
  expect(eventItems({ ...EMPTY_RESULTS, events: [event({ reason: "1. **최소 권한 위반**: 넓습니다.\n2. 기간: 없음", detail: { events: text, first_event_at: "", last_event_at: "" } })] })[0])
    .toMatchObject({ what: "출력행위 2건, 조회 1건", note: "최소 권한 위반" });
});

test("compactLog: 줄마다 같은 [솔루션] 부서 이름(IP)는 머리로 한 번, 줄은 한국 시간 · 위치 · 행위 · 항목", () => {
  const text = "- 2026-09-15 00:10:07 UTC [SecureMark] 재무 정다은(1.1.1.6) — PC / 출력행위 / Attachments=제안서.pptx, PrintCount=3\n"
    + "- 2026-09-16 03:00:35 UTC [SecureMark] 재무 정다은(1.1.1.6) — VDI / 출력행위";
  expect(compactLog(text)).toEqual({
    head: "[SecureMark] 재무 정다은(1.1.1.6)",
    lines: ["2026-09-15 09:10 — PC / 출력행위 / Attachments=제안서.pptx, PrintCount=3", "2026-09-16 12:00 — VDI / 출력행위"],
  });
});

test("compactLog: 사람이 섞이거나 줄 모양이 다르면 원문 그대로(앞의 '- '만 뗌), 비면 빈 목록", () => {
  const mixed = "- 2026-09-15 00:10:07 UTC [A] 재무 정다은(1.1.1.6) — PC / 출력\n- 2026-09-15 00:11:07 UTC [A] 개발 박민수(1.1.1.7) — PC / 출력";
  expect(compactLog(mixed)).toEqual({ head: null, lines: ["2026-09-15 00:10:07 UTC [A] 재무 정다은(1.1.1.6) — PC / 출력", "2026-09-15 00:11:07 UTC [A] 개발 박민수(1.1.1.7) — PC / 출력"] });
  expect(compactLog("로그 없음")).toEqual({ head: null, lines: ["로그 없음"] });
  expect(compactLog("")).toEqual({ head: null, lines: [] });
});

test("passItems: 정상 조항은 결정 없는 정상 줄, 같은 조항은 한 번만", () => {
  const passed = [{ policy_id: "정책_운영기준.md 5.1", reason: "명시적 거부 우선" }, { policy_id: "정책_운영기준.md 5.1", reason: "또" }];
  const r: Results = { ...EMPTY_RESULTS, policy_review: { summary: "", elapsed_sec: null, issues: [], passed } };
  const items = passItems(r);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ type: "pass", key: "pass:정책_운영기준.md 5.1", level: "정상", lead: "정상", what: "명시적 거부 우선", typeLabel: "정상 조항 — 정책_운영기준" });
  expect(items[0].decision).toBeUndefined();
});
