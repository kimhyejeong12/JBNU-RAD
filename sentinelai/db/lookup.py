"""질의 query 도구가 읽는 권한 DB 행 — 읽기만, 비밀번호 · 세션 · 잠금 같은 칸은 고르지 않습니다."""
from __future__ import annotations

from typing import Any

from .core import Database, today

ROLE_LABELS = {"user": "일반 사용자", "manager": "보안 운영자", "top": "보안 총책임자"}
STAGE_LABELS = {"manager": "1차 결재 대기", "top": "최종 결재 대기", "approved": "승인", "rejected": "반려",
                "withdrawn": "철회", "revoked": "회수"}

_PERSON = ("u.display_name AS name, u.login_id, u.department, u.job, u.is_active, u.left_on, u.log_id")


def catalog(db: Database) -> list[dict[str, Any]]:
    with db.connection() as conn:
        rows = conn.execute("SELECT code, name, system, category, description, is_active FROM access_catalog ORDER BY system, name, code")
        return [{**dict(r), "is_active": bool(r["is_active"])} for r in rows]


def accounts(db: Database) -> list[dict[str, Any]]:
    with db.connection() as conn:
        rows = conn.execute(f"SELECT u.id, {_PERSON}, u.role, u.created_at FROM users u ORDER BY u.id").fetchall()
    return [{**dict(r), "is_active": bool(r["is_active"]), "role": ROLE_LABELS[r["role"]]} for r in rows]


def requests(db: Database) -> list[dict[str, Any]]:
    """신청 전부 — 승인 뒤 사용 기간이 끝난 것은 held 가 거짓입니다."""
    with db.connection() as conn:
        rows = conn.execute(
            f"SELECT r.request_no, r.requester_id, {_PERSON}, r.access_code AS code, r.requested_access AS access,"
            " c.system, c.category, r.reason, r.period_start, r.period_end, r.stage, r.submitted_at, r.closed_at,"
            " CASE WHEN r.ai_failed = 1 OR r.ai_judged_at IS NULL THEN NULL ELSE r.ai_level END AS ai_level,"
            " r.manager_name, r.manager_comment, r.top_name, r.top_comment, r.top_decided_at, r.revoke_reason"
            " FROM access_requests r JOIN users u ON u.id = r.requester_id LEFT JOIN access_catalog c ON c.code = r.access_code"
            " ORDER BY r.submitted_at, r.id").fetchall()
    day = today()
    return [{**dict(r), "is_active": bool(r["is_active"]), "stage": STAGE_LABELS[r["stage"]],
             "held": r["stage"] == "approved" and (r["period_end"] == "" or r["period_end"] >= day),
             "expired": r["stage"] == "approved" and r["period_end"] != "" and r["period_end"] < day} for r in rows]


def moves(db: Database) -> list[dict[str, Any]]:
    with db.connection() as conn:
        rows = conn.execute(
            f"SELECT m.user_id, {_PERSON}, m.from_department, m.from_job, m.to_department, m.to_job, m.moved_on"
            " FROM user_moves m JOIN users u ON u.id = m.user_id ORDER BY m.moved_on, m.id").fetchall()
    return [{**dict(r), "is_active": bool(r["is_active"])} for r in rows]
