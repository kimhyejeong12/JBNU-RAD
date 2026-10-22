"""권한 신청 · AI 판정 · 결재 · 회수 (권한 DB, 신청 1건 = 1행).

순서 · 역할 규칙은 트리거가 강제합니다. 여기서는 트리거가 알 수 없는 것(신청자 본인인지, 볼 수 있는 범위)을 확인합니다.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from . import catalog
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


def _today() -> str:
    # 사용 기간은 날짜만 적으므로 화면과 같은 서버 현지 날짜(KST)로 끝났는지 봅니다.
    return datetime.now().astimezone().strftime("%Y-%m-%d")


def _held(conn: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    """지금 가진 권한 = 이 시스템에서 최종 승인됐고 사용 기간이 남은 신청 (회수 · 만료는 빠집니다)."""
    return conn.execute(
        "SELECT request_no, access_code, requested_access, period_end FROM access_requests"
        " WHERE requester_id = ? AND stage = 'approved' AND (period_end = '' OR period_end >= ?) ORDER BY submitted_at",
        (user_id, _today())).fetchall()


def _held_text(rows: list[sqlite3.Row]) -> str:
    lines = []
    for r in rows:
        name = f"{r['requested_access']} ({r['access_code']})" if r["access_code"] else r["requested_access"]
        lines.append(f"{name} — {r['period_end'] + '까지' if r['period_end'] else '기간 없음'}")
    return "\n".join(lines)


def submit(db: Database, by: User, access_code: str, reason: str = "", period_start: str = "", period_end: str = "") -> dict:
    """권한 목록의 켜진 권한만 신청합니다. 신청 때 이름을 requested_access 에 남겨, 목록 이름이 바뀌어도 기록은 그대로입니다.

    현재 보유 권한은 신청자가 적지 않고 신청 때 가진 권한을 읽어 current_access 에 남깁니다 (AI 판정 · 결재자가 본 그대로).
    """
    with db.transaction() as conn:
        item = catalog.get(conn, access_code)
        if not item["is_active"]:
            raise Denied("지금은 신청할 수 없는 권한입니다")
        held = _held(conn, by.id)
        if any(r["access_code"] == item["code"] for r in held):
            raise Denied("이미 가진 권한입니다")
        if conn.execute("SELECT 1 FROM access_requests WHERE requester_id = ? AND access_code = ? AND stage IN ('manager', 'top')",
                        (by.id, item["code"])).fetchone():
            raise Denied("같은 권한의 신청이 결재 중입니다")
        request_no = _next_request_no(conn)
        rid = conn.execute(
            "INSERT INTO access_requests (request_no, requester_id, requester_name, requester_department, access_code,"
            " requested_access, current_access, reason, period_start, period_end, submitted_at)"
            " SELECT ?, id, display_name, department, ?, ?, ?, ?, ?, ?, ? FROM users WHERE id = ?",
            (request_no, item["code"], item["name"], _held_text(held), reason.strip(), period_start, period_end, now(), by.id),
        ).lastrowid
        audit(conn, "request_submit", by.id, target_type="request", target_id=request_no)
        return _detail(conn, rid)


def _row(conn: sqlite3.Connection, request_no: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM access_requests WHERE request_no = ?", (request_no,)).fetchone()
    if row is None:
        raise Denied("없는 신청입니다")
    return row


def _detail(conn: sqlite3.Connection, rid: int) -> dict:
    """신청 한 행 → 화면용 dict. AI 판정 · 결재 · 회수 칸은 묶음으로 나눠 담습니다."""
    row = dict(conn.execute("SELECT * FROM access_requests WHERE id = ?", (rid,)).fetchone())
    req = {k: v for k, v in row.items() if not k.startswith(("ai_", "manager_", "top_", "revoke"))}
    req["ai_verdict"] = None if row["ai_judged_at"] is None else {
        "level": row["ai_level"], "reason": row["ai_reason"], "recommendation": row["ai_recommendation"],
        "sources": json.loads(row["ai_sources"]), "failed": bool(row["ai_failed"]), "error": row["ai_error"],
        "model": row["ai_model"], "elapsed_sec": row["ai_elapsed_sec"], "judged_at": row["ai_judged_at"],
    }
    # 1차 결재 뒤에는 AI 칸이 굳으므로, 두 결재자가 본 판정은 같은 AI 칸입니다.
    seen = row["ai_level"] if row["ai_judged_at"] and not row["ai_failed"] else None
    req["approvals"] = [
        {"step": step, "action": row[f"{step}_action"], "comment": row[f"{step}_comment"], "approver_id": row[f"{step}_id"],
         "approver_name": row[f"{step}_name"], "approver_department": row[f"{step}_department"],
         "ai_level": seen, "decided_at": row[f"{step}_decided_at"]}
        for step in ("manager", "top") if row[f"{step}_action"]
    ]
    req["revocation"] = None if row["revoked_at"] is None else {
        "reason": row["revoke_reason"], "revoker_id": row["revoker_id"], "revoker_name": row["revoker_name"],
        "revoker_department": row["revoker_department"], "revoked_at": row["revoked_at"],
    }
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
    """일반 사용자는 자기 신청만, 보안 운영자 · 보안 총책임자는 전부. stage 로 결재함을 거릅니다. 결재 · 회수 기록까지 담습니다."""
    if stage is not None and stage not in STAGES:
        raise Denied(f"stage 는 {', '.join(STAGES)} 중 하나입니다")
    where, args = [], []
    if mine or by.role == "user":
        where.append("requester_id = ?"); args.append(by.id)
    if stage:
        where.append("stage = ?"); args.append(stage)
    sql = "SELECT id FROM access_requests" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY submitted_at DESC, id DESC"
    with db.connection() as conn:
        return [_detail(conn, r["id"]) for r in conn.execute(sql, args).fetchall()]


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


def _person(conn: sqlite3.Connection, by: User) -> sqlite3.Row:
    return conn.execute("SELECT id, display_name, department FROM users WHERE id = ?", (by.id,)).fetchone()


def decide(db: Database, by: User, request_no: str, action: str, comment: str = "") -> dict:
    """결재. 단계는 결재자의 역할로 정합니다 (보안 운영자 = 1차, 보안 총책임자 = 최종). 결재자가 본 AI 판정은 신청 행의 AI 칸입니다."""
    if action not in ("approve", "reject"):
        raise Denied("action 은 approve · reject 중 하나입니다")
    if by.role not in ("manager", "top"):
        raise Denied("결재할 수 있는 역할이 아닙니다")
    step = by.role
    with db.transaction() as conn:
        req = _row(conn, request_no)
        person = _person(conn, by)
        conn.execute(
            f"UPDATE access_requests SET {step}_action = ?, {step}_comment = ?, {step}_id = ?, {step}_name = ?,"
            f" {step}_department = ?, {step}_decided_at = ? WHERE id = ?",
            (action, comment.strip(), person["id"], person["display_name"], person["department"], now(), req["id"]),
        )
        audit(conn, f"request_{action}", by.id, target_type="request", target_id=request_no,
              detail=json.dumps({"step": step, "ai_level": req["ai_level"] if not req["ai_failed"] else None}, ensure_ascii=False))
        return _detail(conn, req["id"])


def revoke(db: Database, by: User, request_no: str, reason: str) -> dict:
    if not reason.strip():
        raise Denied("회수 사유를 적어 주세요")
    with db.transaction() as conn:
        req = _row(conn, request_no)
        person = _person(conn, by)
        conn.execute(
            "UPDATE access_requests SET revoke_reason = ?, revoker_id = ?, revoker_name = ?, revoker_department = ?, revoked_at = ?"
            " WHERE id = ?",
            (reason.strip(), person["id"], person["display_name"], person["department"], now(), req["id"]),
        )
        audit(conn, "request_revoke", by.id, target_type="request", target_id=request_no)
        return _detail(conn, req["id"])


# --- 보안 통계 ---------------------------------------------------------------

OUTCOME = {"manager": "결재 중", "top": "결재 중", "approved": "승인", "rejected": "반려", "withdrawn": "철회", "revoked": "회수"}


def request_stats(db: Database, since: str | None = None) -> dict[str, Any]:
    """보안 통계 — 전체 · 부서 · 권한별 AI 등급(주의 · 위험 = 정책 위반 소지)과 결재 결과, AI 와 결재가 엇갈린 신청. since(신청 시각)가 없으면 전체."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT request_no, requester_name, requester_department, access_code, requested_access, stage,"
            " ai_level, ai_failed, ai_judged_at, manager_action, top_action, submitted_at FROM access_requests"
            + (" WHERE submitted_at >= ?" if since else "") + " ORDER BY submitted_at", (since,) if since else ()).fetchall()

    def bucket(groups: dict, key: str) -> dict:
        return groups.setdefault(key, {"name": key, "신청": 0, "ai": {}, "outcome": {}})

    departments: dict[str, dict] = {}
    accesses: dict[str, dict] = {}
    totals: dict[str, int] = {}
    mismatches = []
    for r in rows:
        ai = "판정 없음" if r["ai_judged_at"] is None else "판정 실패" if r["ai_failed"] else r["ai_level"]
        # 회수는 최종 승인을 거친 것이라 결재 결과로는 승인입니다.
        outcome = OUTCOME[r["stage"]]
        decided = "승인" if outcome in ("승인", "회수") else "반려" if outcome == "반려" else None
        totals[ai] = totals.get(ai, 0) + 1
        for g in (bucket(departments, r["requester_department"] or "부서 없음"), bucket(accesses, r["requested_access"])):
            g["신청"] += 1
            g["ai"][ai] = g["ai"].get(ai, 0) + 1
            g["outcome"][outcome] = g["outcome"].get(outcome, 0) + 1
        if (ai == "위험" and decided == "승인") or (ai == "정상" and decided == "반려"):
            mismatches.append({"request_no": r["request_no"], "requester": f"{r['requester_department']} {r['requester_name']}".strip(),
                               "access": r["requested_access"], "ai": ai, "outcome": outcome, "submitted_at": r["submitted_at"]})
    order = lambda g: (-g["ai"].get("위험", 0), -g["신청"], g["name"])  # noqa: E731
    return {"total": len(rows), "ai": totals, "departments": sorted(departments.values(), key=order),
            "accesses": sorted(accesses.values(), key=order), "mismatches": mismatches}


# --- AI 판정 (신청 행의 AI 칸) --------------------------------------------------


def save_ai_verdict(db: Database, request_no: str, result: dict, model: str) -> bool:
    """pipeline.judge_request 의 결과를 신청 행에 씁니다. 그사이 1차 결재가 났으면 쓰지 않고 False"""
    with db.transaction() as conn:
        updated = conn.execute(
            "UPDATE access_requests SET ai_level = ?, ai_reason = ?, ai_recommendation = ?, ai_sources = ?, ai_failed = ?,"
            " ai_error = ?, ai_model = ?, ai_elapsed_sec = ?, ai_judged_at = ?"
            " WHERE request_no = ? AND stage = 'manager' AND manager_action IS NULL",
            (result.get("level"), result.get("reason", ""), result.get("recommendation", ""),
             json.dumps(result.get("sources", []), ensure_ascii=False), int(result["failed"]), result.get("error"),
             model, result.get("elapsed_sec"), now(), request_no),
        ).rowcount
    return updated == 1


def rejudgeable(db: Database, request_no: str) -> bool:
    with db.connection() as conn:
        return _row(conn, request_no)["stage"] == "manager"


def unjudged(db: Database) -> list[str]:
    """1차 결재 전인데 성공한 판정이 없는 신청. 웹을 다시 띄웠을 때 밀렸거나 실패한 판정을 다시 돌립니다."""
    with db.connection() as conn:
        return [r[0] for r in conn.execute(
            "SELECT request_no FROM access_requests WHERE stage = 'manager' AND (ai_judged_at IS NULL OR ai_failed = 1)"
            " ORDER BY id")]

