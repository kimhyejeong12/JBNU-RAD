"""알림 · 변경 이력이 읽는 DB 변화 — AI 결과 DB 의 로그 감시 위험 판정, 권한 DB 의 감사 기록 · 보유 권한 재검토 · 계정 상태 · 퇴사자 권한 (읽기만)."""
from __future__ import annotations

import json
from typing import Any

from .core import Database, today

# --- 로그 감시 위험 (AI 결과 DB) ---

def last_finding_id(db: Database) -> int:
    """로그 감시 판정의 마지막 id(없으면 0) — 알림이 여기서부터 새 판정을 셉니다."""
    with db.connection() as conn:
        return conn.execute("SELECT coalesce(max(id), 0) FROM event_findings").fetchone()[0]


def findings_after(db: Database, after: int, level: str = "위험") -> list[dict[str, Any]]:
    """after 뒤로 쌓인 그 등급의 로그 감시 판정(실패 제외) — id · 사용자 · 부서 이름 · 로그 구간 · 묶인 로그 글 · AI 이유 · 단계(fast · final)."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT f.id, f.\"user\", f.subject, f.first_event_at, f.last_event_at, f.events, f.reason, m.stage FROM event_findings f"
            " JOIN monitor_runs m ON m.id = f.run_id WHERE f.id > %s AND f.level = %s AND f.failed = 0 ORDER BY f.id",
            (after, level)).fetchall()
    return [dict(r) for r in rows]


# --- 1차 결재 대기 (권한 DB) ---

def last_request_id(db: Database) -> int:
    with db.connection() as conn:
        return conn.execute("SELECT coalesce(max(id), 0) FROM access_requests").fetchone()[0]


def request_ids_after(db: Database, after: int) -> list[int]:
    with db.connection() as conn:
        return [r["id"] for r in conn.execute("SELECT id FROM access_requests WHERE id > %s ORDER BY id", (after,))]


def unjudged_request_ids(db: Database, since: str) -> list[int]:
    """1차 결재를 기다리는데 AI 판정이 아직 없는 신청 중 since 뒤에 들어온 것 — 웹을 다시 띄웠을 때 이어서 지켜볼 것."""
    with db.connection() as conn:
        return [r["id"] for r in conn.execute(
            "SELECT id FROM access_requests WHERE stage = 'manager' AND ai_judged_at IS NULL AND submitted_at >= %s ORDER BY id", (since,))]


def waiting_requests(db: Database, ids: list[int]) -> list[dict[str, Any]]:
    """알림에 쓸 신청 행 — 칸 이름은 permissions 의 화면용 dict 와 같고, ai_verdict 는 판정이 없으면 None 입니다."""
    if not ids:
        return []
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT id, request_no, stage, submitted_at, requester_name, requester_department, requester_job, requested_access,"
            " period_start, period_end, ai_level, ai_reason, ai_failed, ai_judged_at FROM access_requests WHERE id = ANY(%s) ORDER BY id",
            (ids,)).fetchall()
    return [{**{k: v for k, v in r.items() if not k.startswith("ai_")},
             "ai_verdict": None if r["ai_judged_at"] is None else {"level": r["ai_level"], "reason": r["ai_reason"], "failed": bool(r["ai_failed"])}}
            for r in rows]


# --- 예외 상황 (권한 DB) ---

#: 알리는 감사 기록 — 보안 설정 변경과 결재(AI 위험인데 최종 승인을 고르려고).
ACTIONS = ("regulation_upload", "regulation_edit", "regulation_remove", "access_create", "access_update",
           "node_key_issue", "node_update", "jobs_reset", "queue_clear", "request_approve")


def cursor(db: Database) -> tuple[int, int]:
    """(마지막 감사 기록 id, 마지막 보유 권한 재검토 id)."""
    with db.connection() as conn:
        audit = conn.execute("SELECT coalesce(max(id), 0) FROM audit_log").fetchone()[0]
        grant = conn.execute("SELECT coalesce(max(id), 0) FROM grant_reviews").fetchone()[0]
    return audit, grant


def audit_after(db: Database, after: int) -> list[dict[str, Any]]:
    with db.connection() as conn:
        rows = conn.execute("SELECT id, action, target_id, detail FROM audit_log WHERE id > %s AND action = ANY(%s) ORDER BY id",
                            (after, list(ACTIONS))).fetchall()
    return [{**r, "detail": json.loads(r["detail"] or "{}")} for r in rows]


def requests_by_no(db: Database, nos: list[str]) -> dict[str, dict[str, Any]]:
    if not nos:
        return {}
    with db.connection() as conn:
        rows = conn.execute("SELECT request_no, requester_department, requested_access FROM access_requests WHERE request_no = ANY(%s)",
                            (nos,)).fetchall()
    return {r["request_no"]: dict(r) for r in rows}


def risky_grants_after(db: Database, after: int) -> list[dict[str, Any]]:
    """이동 뒤 보유 권한 재검토에서 위험이 나온 것 (판정 실패 제외)."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT g.id, r.request_no, r.requested_access FROM grant_reviews g JOIN access_requests r ON r.id = g.request_id"
            " WHERE g.id > %s AND g.failed = 0 AND g.level = '위험' ORDER BY g.id", (after,)).fetchall()
    return [dict(r) for r in rows]


def accounts(db: Database) -> dict[int, tuple[str, bool]]:
    """계정마다 (역할, 활성)."""
    with db.connection() as conn:
        return {r["id"]: (r["role"], bool(r["is_active"])) for r in conn.execute("SELECT id, role, is_active FROM users")}


def gone_holders(db: Database) -> dict[int, int]:
    """퇴사일이 지났는데 지금 가진 권한이 남은 계정 → 남은 권한 수."""
    day = today()
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT r.requester_id, count(*) AS n FROM access_requests r JOIN users u ON u.id = r.requester_id"
            " WHERE u.left_on <> '' AND u.left_on <= %s AND r.stage = 'approved' AND (r.period_end = '' OR r.period_end >= %s)"
            " GROUP BY r.requester_id", (day, day)).fetchall()
    return {r["requester_id"]: r["n"] for r in rows}


def history(db: Database, target_type: str, target_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """한 대상의 감사 기록(최근 것부터) — 기준 문서의 지난 원문(before)은 길어서 뺍니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT a.id, a.at, a.action, a.detail, coalesce(u.display_name, a.login_id, '') AS by_name FROM audit_log a"
            " LEFT JOIN users u ON u.id = a.user_id WHERE a.target_type = %s AND a.target_id = %s ORDER BY a.id DESC LIMIT %s",
            (target_type, target_id, limit)).fetchall()
    out = []
    for r in rows:
        detail = json.loads(r["detail"] or "{}")
        detail.pop("before", None)
        out.append({"id": r["id"], "at": r["at"], "action": r["action"], "by": r["by_name"], "detail": detail})
    return out
