"""예외 알림이 읽는 권한 DB 변화 — 감사 기록 · 보유 권한 재검토 · 계정 상태 · 퇴사자 권한 (읽기만)."""
from __future__ import annotations

import json
from typing import Any

from .core import Database, today

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
