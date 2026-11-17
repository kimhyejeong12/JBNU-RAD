import { describe, expect, it } from "vitest";
import { mergeWatch, pickPeople, revokeReason, status, summarize } from "./lib";
import type { RiskPerson, WatchPerson } from "@/shared/api/types";

const person = (over: Partial<RiskPerson>): RiskPerson => ({
  id: 1, login_id: "u", name: "정다은", department: "영업팀", job: "", is_active: true, left_on: "", level: "주의", at: "2026-10-01", flags: [], log_id: "", log_user: "", ...over,
});

describe("risk lib", () => {
  const moved = person({ id: 1, level: "위험", flags: [
    { kind: "move", level: "정상", at: "2026-10-05", text: "이동" },
    { kind: "grant", level: "위험", at: "2026-09-01", text: "보유 급여 — 이동 뒤 재검토 위험", request_no: "REQ-1" },
    { kind: "event", level: "주의", at: "2026-10-06", text: "이동 뒤 로그 감시 주의", event_key: "event_findings/3" },
  ] });
  const expired = person({ id: 2, flags: [
    { kind: "expired", level: "주의", at: "2026-11-01", text: "급여 — 만료", request_no: "REQ-2" },
  ] });

  it("summarizes people per signal", () => {
    expect(summarize([moved, expired])).toEqual({ danger: 1, caution: 1, moved: 1, grants: 1, events: 1, expired: 1, left: 0 });
  });

  it("adds only leave from the watch list", () => {
    const watch = (over: Partial<WatchPerson>): WatchPerson => ({
      id: 9, login_id: "w", name: "박퇴사", department: "인사팀", job: "", is_active: true, left_on: "2026-11-01", level: "위험", at: "2026-11-01", flags: [], ...over,
    });
    const merged = mergeWatch([moved], [
      watch({ id: 1, flags: [
        { kind: "move", level: "정상", at: "2026-10-05", text: "이동" },
        { kind: "grant", level: "위험", at: "2026-09-01", text: "보유 급여 — 이동 뒤 재검토 위험", request_no: "REQ-1" },
        { kind: "grant", level: "주의", at: "2026-08-01", text: "보유 CRM — 승인 때 AI 판정 주의", request_no: "REQ-7" },
        { kind: "request", level: "위험", at: "2026-11-02", text: "신청 급여 — AI 판정 위험", request_no: "REQ-8" },
      ] }),
      watch({ flags: [{ kind: "leave", level: "위험", at: "2026-11-01", text: "2026-11-01 퇴사 — 권한 1건" }] }),
    ]);
    expect(merged.map((p) => p.id)).toEqual([1, 9]);
    expect(merged[0].flags).toEqual(moved.flags);   // 이동 · 재검토 · 승인 때 AI 판정 · 결재 중 신청은 붙이지 않음
    expect(merged[1]).toMatchObject({ name: "박퇴사", level: "위험", log_user: "" });
    expect(status(merged[1])).toBe("퇴사 2026-11-01");
    expect(summarize(merged).left).toBe(1);
  });

  it("shows move and expired counts", () => {
    expect(status(moved)).toBe("부서 이동 2026-10-05");
    expect(status(expired)).toBe("만료 권한 1건");
  });

  it("offers revoke only for expired or misfit grants", () => {
    expect(revokeReason({ kind: "grant", level: "주의", at: "2026-10-20", text: "보유 CRM — 재검토 대기", request_no: "REQ-3" })).toBeNull();
    expect(moved.flags.map(revokeReason)).toEqual([null, "부서 이동 뒤 업무에 맞지 않는 권한", null]);
    expect(revokeReason(expired.flags[0])).toBe("사용 기간 만료 (2026-11-01)");
  });

  it("filters by the picked tile, all when none", () => {
    expect(pickPeople([moved, expired], "danger").map((p) => p.id)).toEqual([1]);
    expect(pickPeople([moved, expired], "moved").map((p) => p.id)).toEqual([1]);
    expect(pickPeople([moved, expired], "expired").map((p) => p.id)).toEqual([2]);
    expect(pickPeople([moved, expired], "left")).toEqual([]);
    expect(pickPeople([moved, expired], null)).toHaveLength(2);
  });
});
