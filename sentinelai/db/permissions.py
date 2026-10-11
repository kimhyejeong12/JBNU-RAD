"""권한 신청 · 결재 · 회수 (권한 DB).

순서 · 역할 규칙은 트리거가 강제합니다. 여기서는 트리거가 알 수 없는 것(신청자 본인인지, 볼 수 있는 범위)을 확인합니다.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime

from .auth import User
from .core import Database, Denied, audit, now

STAGES = ("manager", "top", "approved", "rejected", "withdrawn", "revoked")


def _next_request_no(conn: sqlite3.Connection) -> str:
    # 날짜는 사내 업무 기준인 서버 현지 시각(KST)으로 매깁니다.
    day = datetime.now().astimezone().strftime("%Y%m%d")
    last = conn.execute("SELECT max(request_no) FROM access_requests WHERE request_no LIKE ?", (f"REQ-{day}-%",)).fetchone()[0]
    seq = int(last[-3:]) + 1 if last else 1
    if seq > 999:
        raise Denied("오늘 받을 수 있는 신청 수(999건)를 넘었습니다")
    return f"REQ-{day}-{seq:03d}"


def submit(db: Database, by: User, requested_access: str, current_access: str = "", reason: str = "",
           period_start: str = "", period_end: str = "") -> dict:
    if not requested_access.strip():
        raise Denied("신청할 권한을 적어 주세요")
    with db.transaction() as conn:
        request_no = _next_request_no(conn)
        rid = conn.execute(
            "INSERT INTO access_requests (request_no, requester_id, requester_name, requester_department, requested_access,"
            " current_access, reason, period_start, period_end, submitted_at)"
            " SELECT ?, id, display_name, department, ?, ?, ?, ?, ?, ? FROM users WHERE id = ?",
            (request_no, requested_access.strip(), current_access.strip(), reason.strip(), period_start, period_end, now(), by.id),
        ).lastrowid
        audit(conn, "request_submit", by.id, target_type="request", target_id=request_no)
        return _detail(conn, rid)


def _row(conn: sqlite3.Connection, request_no: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM access_requests WHERE request_no = ?", (request_no,)).fetchone()
    if row is None:
        raise Denied("없는 신청입니다")
    return row


def _detail(conn: sqlite3.Connection, rid: int) -> dict:
    req = dict(conn.execute("SELECT * FROM access_requests WHERE id = ?", (rid,)).fetchone())
    req["approvals"] = [dict(r) for r in conn.execute(
        "SELECT step, action, comment, approver_id, approver_name, approver_department, ai_verdict_ref, ai_level, decided_at"
        " FROM approvals WHERE request_id = ? ORDER BY id", (rid,))]
    rev = conn.execute(
        "SELECT reason, revoker_id, revoker_name, revoker_department, revoked_at FROM revocations WHERE request_id = ?", (rid,)
    ).fetchone()
    req["revocation"] = dict(rev) if rev else None
    return req


def _can_view(by: User, req: sqlite3.Row) -> bool:
    return by.role in ("manager", "top") or req["requester_id"] == by.id


def get(db: Database, by: User, request_no: str) -> dict:
    with db.connection() as conn:
        req = _row(conn, request_no)
        if not _can_view(by, req):
            raise Denied("볼 수 없는 신청입니다")
        return _detail(conn, req["id"])


def list_requests(db: Database, by: User, stage: str | None = None, mine: bool = False) -> list[dict]:
    """일반사용자는 자기 신청만, 중간관리자 · 최상급자는 전부. stage 로 결재함을 거릅니다."""
    if stage is not None and stage not in STAGES:
        raise Denied(f"stage 는 {', '.join(STAGES)} 중 하나입니다")
    where, args = [], []
    if mine or by.role == "user":
        where.append("requester_id = ?"); args.append(by.id)
    if stage:
        where.append("stage = ?"); args.append(stage)
    sql = "SELECT * FROM access_requests" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY submitted_at DESC, id DESC"
    with db.connection() as conn:
        return [dict(r) for r in conn.execute(sql, args)]


def withdraw(db: Database, by: User, request_no: str) -> dict:
    with db.transaction() as conn:
        req = _row(conn, request_no)
        if req["requester_id"] != by.id:
            raise Denied("본인 신청만 철회할 수 있습니다")
        if req["stage"] != "manager":
            raise Denied("1차 결재 전에만 철회할 수 있습니다")
        conn.execute("UPDATE access_requests SET stage = 'withdrawn', closed_at = ? WHERE id = ?", (now(), req["id"]))
        audit(conn, "request_withdraw", by.id, target_type="request", target_id=request_no)
        return _detail(conn, req["id"])


def decide(db: Database, by: User, request_no: str, action: str, comment: str = "",
           ai_verdict_ref: str | None = None, ai_level: str | None = None) -> dict:
    """결재. 단계는 결재자의 역할로 정합니다 (중간관리자 = 1차, 최상급자 = 최종)."""
    if action not in ("approve", "reject"):
        raise Denied("action 은 approve · reject 중 하나입니다")
    if by.role not in ("manager", "top"):
        raise Denied("결재할 수 있는 역할이 아닙니다")
    with db.transaction() as conn:
        req = _row(conn, request_no)
        conn.execute(
            "INSERT INTO approvals (request_id, step, action, comment, approver_id, approver_name, approver_department,"
            " ai_verdict_ref, ai_level, decided_at)"
            " SELECT ?, role, ?, ?, id, display_name, department, ?, ?, ? FROM users WHERE id = ?",
            (req["id"], action, comment.strip(), ai_verdict_ref, ai_level, now(), by.id),
        )
        audit(conn, f"request_{action}", by.id, target_type="request", target_id=request_no,
              detail=json.dumps({"step": by.role, "ai_level": ai_level}, ensure_ascii=False))
        return _detail(conn, req["id"])


def revoke(db: Database, by: User, request_no: str, reason: str) -> dict:
    if not reason.strip():
        raise Denied("회수 사유를 적어 주세요")
    with db.transaction() as conn:
        req = _row(conn, request_no)
        conn.execute(
            "INSERT INTO revocations (request_id, reason, revoker_id, revoker_name, revoker_department, revoked_at)"
            " SELECT ?, ?, id, display_name, department, ? FROM users WHERE id = ?",
            (req["id"], reason.strip(), now(), by.id),
        )
        audit(conn, "request_revoke", by.id, target_type="request", target_id=request_no)
        return _detail(conn, req["id"])


def active_grants(db: Database, by: User) -> list[dict]:
    if by.role not in ("manager", "top"):
        raise Denied("권한 현황은 중간관리자 · 최상급자만 볼 수 있습니다")
    with db.connection() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM active_grants ORDER BY closed_at DESC")]
