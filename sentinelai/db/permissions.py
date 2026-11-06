"""권한 신청 (1건 = 1행) — 트리거가 알 수 없는 것(신청자 본인 · 볼 수 있는 범위)만 여기서 확인합니다."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

import psycopg

from . import catalog
from .auth import User
from .core import Database, Denied, Row, audit, now, today

STAGES = ("manager", "top", "approved", "rejected", "withdrawn", "revoked")
# 신청 판정에 "최근 이동"으로 넣는 기간입니다.
RECENT_MOVE_DAYS = 90
STAGE_TEXT = {"manager": "1차 결재 대기", "top": "최종 결재 대기", "approved": "승인", "rejected": "반려", "withdrawn": "철회", "revoked": "회수"}


def _next_request_no(conn: psycopg.Connection[Row]) -> str:
    # 사내 업무 기준인 서버 현지 날짜(KST)로 매깁니다.
    day = datetime.now().astimezone().strftime("%Y%m%d")
    last = conn.execute("SELECT max(request_no) FROM access_requests WHERE request_no LIKE %s", (f"REQ-{day}-%",)).fetchone()[0]
    seq = int(last[-3:]) + 1 if last else 1
    if seq > 999:
        raise Denied("오늘 받을 수 있는 신청 수(999건)를 넘었습니다")
    return f"REQ-{day}-{seq:03d}"



def _held(conn: psycopg.Connection[Row], user_id: int) -> list[Row]:
    """지금 가진 권한 = 최종 승인됐고 사용 기간이 남은 신청입니다."""
    return conn.execute(
        "SELECT r.request_no, r.access_code, r.requested_access, r.period_end, c.system, c.category, c.description"
        " FROM access_requests r LEFT JOIN access_catalog c ON c.code = r.access_code"
        " WHERE r.requester_id = %s AND r.stage = 'approved' AND (r.period_end = '' OR r.period_end >= %s) ORDER BY r.submitted_at",
        (user_id, today())).fetchall()


def _held_text(rows: list[Row]) -> str:
    lines = []
    for r in rows:
        name = f"{r['requested_access']} ({r['access_code']})" if r["access_code"] else r["requested_access"]
        lines.append(f"{name} — {r['period_end'] + '까지' if r['period_end'] else '기간 없음'}")
    return "\n".join(lines)


def submit(db: Database, by: User, access_code: str, reason: str = "", period_start: str = "", period_end: str = "") -> dict:
    """켜진 권한만 신청하고, 신청 때 이름 · 보유 권한을 행에 남겨 목록이 바뀌어도 기록은 그대로입니다."""
    with db.transaction() as conn:
        item = catalog.get(conn, access_code)
        if not item["is_active"]:
            raise Denied("지금은 신청할 수 없는 권한입니다")
        held = _held(conn, by.id)
        if any(r["access_code"] == item["code"] for r in held):
            raise Denied("이미 가진 권한입니다")
        if conn.execute("SELECT 1 FROM access_requests WHERE requester_id = %s AND access_code = %s AND stage IN ('manager', 'top')",
                        (by.id, item["code"])).fetchone():
            raise Denied("같은 권한의 신청이 결재 중입니다")
        request_no = _next_request_no(conn)
        rid = conn.execute(
            "INSERT INTO access_requests (request_no, requester_id, requester_name, requester_department, requester_job, access_code,"
            " requested_access, current_access, reason, period_start, period_end, submitted_at)"
            " SELECT %s, id, display_name, department, job, %s, %s, %s, %s, %s, %s, %s FROM users WHERE id = %s RETURNING id",
            (request_no, item["code"], item["name"], _held_text(held), reason.strip(), period_start, period_end, now(), by.id),
        ).fetchone()[0]
        audit(conn, "request_submit", by.id, target_type="request", target_id=request_no)
        return _detail(conn, rid)


def _row(conn: psycopg.Connection[Row], request_no: str) -> Row:
    row = conn.execute("SELECT * FROM access_requests WHERE request_no = %s", (request_no,)).fetchone()
    if row is None:
        raise Denied("없는 신청입니다")
    return row


def _detail(conn: psycopg.Connection[Row], rid: int) -> dict:
    """신청 한 행 → 화면용 dict (AI 판정 · 결재 · 회수는 묶음으로)."""
    row = dict(conn.execute("SELECT * FROM access_requests WHERE id = %s", (rid,)).fetchone())
    req = {k: v for k, v in row.items() if not k.startswith(("ai_", "manager_", "top_", "revoke"))}
    req["ai_verdict"] = None if row["ai_judged_at"] is None else {
        "level": row["ai_level"], "reason": row["ai_reason"], "recommendation": row["ai_recommendation"],
        "sources": json.loads(row["ai_sources"]), "failed": bool(row["ai_failed"]), "error": row["ai_error"],
        "model": row["ai_model"], "elapsed_sec": row["ai_elapsed_sec"], "judged_at": row["ai_judged_at"],
    }
    # 1차 결재 뒤에는 AI 칸이 굳어 두 결재자가 본 판정이 같습니다.
    seen = row["ai_level"] if row["ai_judged_at"] and not row["ai_failed"] else None
    req["approvals"] = [
        {"step": step, "action": row[f"{step}_action"], "comment": row[f"{step}_comment"], "approver_id": row[f"{step}_id"],
         "approver_name": row[f"{step}_name"], "approver_department": row[f"{step}_department"],
         "ai_level": seen, "decided_at": row[f"{step}_decided_at"]}
        for step in ("manager", "top") if row[f"{step}_action"]
    ]
    req["grant_review"] = _grant_review(conn, row)
    req["revocation"] = None if row["revoked_at"] is None else {
        "reason": row["revoke_reason"], "revoker_id": row["revoker_id"], "revoker_name": row["revoker_name"],
        "revoker_department": row["revoker_department"], "revoked_at": row["revoked_at"],
    }
    return req


# --- 받은 뒤 재검토 (퇴사 · 사내 이동) ---

LEAVE_VERDICT = {"level": "위험", "recommendation": "이 권한을 회수하십시오.", "sources": [], "failed": False, "error": None,
                 "model": "", "elapsed_sec": None, "judged_at": None, "by": "code"}


def _is_held(row: Any) -> bool:
    return row["stage"] == "approved" and (row["period_end"] == "" or row["period_end"] >= today())


def _latest_move(conn: psycopg.Connection[Row], user_id: int, after: str) -> Row | None:
    """after(신청 시각) 뒤에 기록된 마지막 이동입니다."""
    return conn.execute("SELECT * FROM user_moves WHERE user_id = %s AND recorded_at > %s ORDER BY id DESC LIMIT 1",
                        (user_id, after)).fetchone()


def _move(m: Row) -> dict[str, Any]:
    return {"id": m["id"], "from_department": m["from_department"], "from_job": m["from_job"],
            "to_department": m["to_department"], "to_job": m["to_job"], "moved_on": m["moved_on"]}


def _grant_review(conn: psycopg.Connection[Row], row: Any) -> dict[str, Any] | None:
    """퇴사했으면 코드가 위험, 신청 뒤 이동했으면 그 이동의 AI 판정(아직이면 verdict None)입니다."""
    if not _is_held(row):
        return None
    user = conn.execute("SELECT left_on FROM users WHERE id = %s", (row["requester_id"],)).fetchone()
    if user and user["left_on"] and user["left_on"] <= today():
        return {"cause": "leave", "left_on": user["left_on"],
                "verdict": {**LEAVE_VERDICT, "reason": f"{user['left_on']} 퇴사한 사람의 권한이 아직 남아 있습니다."}}
    move = _latest_move(conn, row["requester_id"], row["submitted_at"])
    if move is None:
        return None
    g = conn.execute("SELECT * FROM grant_reviews WHERE request_id = %s AND move_id = %s ORDER BY id DESC LIMIT 1",
                     (row["id"], move["id"])).fetchone()
    return {"cause": "move", "move": _move(move), "verdict": None if g is None else {
        "level": g["level"], "reason": g["reason"], "recommendation": g["recommendation"], "sources": json.loads(g["sources"]),
        "failed": bool(g["failed"]), "error": g["error"], "model": g["model"], "elapsed_sec": g["elapsed_sec"],
        "judged_at": g["judged_at"], "by": "ai"}}


LEVEL_RANK = {"정상": 0, "주의": 1, "위험": 2}
# 확인할 사람에 이동 · 퇴사를 보여 주는 기간입니다.
WATCH_DAYS = 90


def watch_people(db: Database) -> list[dict[str, Any]]:
    """퇴사 · 이동 · 위험하거나 주의인 신청 · 보유 권한이 걸린 일반 사용자와 flags(leave · move · grant · request)입니다."""
    day = today()
    since = (date.fromisoformat(day) - timedelta(days=WATCH_DAYS)).isoformat()
    out = []
    with db.connection() as conn:
        users = conn.execute("SELECT id, login_id, display_name, department, job, is_active, left_on FROM users WHERE role = 'user' ORDER BY id").fetchall()
        for u in users:
            flags: list[dict[str, Any]] = []
            held = conn.execute(
                "SELECT * FROM access_requests WHERE requester_id = %s AND stage = 'approved' AND (period_end = '' OR period_end >= %s)"
                " ORDER BY submitted_at", (u["id"], day)).fetchall()
            if u["left_on"]:
                gone = u["left_on"] <= day
                if gone and (held or u["is_active"] or u["left_on"] >= since):
                    level = "위험" if held else "주의" if u["is_active"] else "정상"
                    note = f"권한 {len(held)}건 남음" if held else "계정 아직 활성" if u["is_active"] else "권한 · 계정 정리됨"
                    flags.append({"kind": "leave", "level": level, "at": u["left_on"], "text": f"{u['left_on']} 퇴사 — {note}"})
                elif not gone:
                    flags.append({"kind": "leave", "level": "주의", "at": u["left_on"], "text": f"{u['left_on']} 퇴사 예정 — 권한 {len(held)}건"})
            for m in conn.execute("SELECT * FROM user_moves WHERE user_id = %s AND moved_on >= %s ORDER BY id", (u["id"], since)):
                flags.append({"kind": "move", "level": "정상", "at": m["moved_on"], "text": f"이동 {_move_text(m)}"})
            for r in held:
                review = _grant_review(conn, r)
                v = review["verdict"] if review else None
                if review and review["cause"] == "move" and (v is None or v["failed"] or v["level"] != "정상"):
                    state = "재검토 대기" if v is None else "재검토 실패" if v["failed"] else f"이동 뒤 재검토 {v['level']}"
                    flags.append({"kind": "grant", "level": "주의" if v is None or v["failed"] else v["level"], "at": r["submitted_at"][:10],
                                  "request_no": r["request_no"], "text": f"보유 {r['requested_access']} — {state}"})
                elif r["ai_level"] in ("위험", "주의") and not r["ai_failed"] and not (review and review["cause"] == "leave"):
                    flags.append({"kind": "grant", "level": r["ai_level"], "at": r["submitted_at"][:10], "request_no": r["request_no"],
                                  "text": f"보유 {r['requested_access']} — 승인 때 AI 판정 {r['ai_level']}"})
            for r in conn.execute("SELECT * FROM access_requests WHERE requester_id = %s AND stage IN ('manager', 'top')"
                                  " AND ai_failed = 0 AND ai_level IN ('위험', '주의') ORDER BY submitted_at", (u["id"],)):
                flags.append({"kind": "request", "level": r["ai_level"], "at": r["submitted_at"][:10], "request_no": r["request_no"],
                              "text": f"신청 {r['requested_access']} — AI 판정 {r['ai_level']} ({STAGE_TEXT[r['stage']]})"})
            if flags:
                flags.sort(key=lambda f: f["at"], reverse=True)
                flags.sort(key=lambda f: -LEVEL_RANK[f["level"]])
                out.append({"id": u["id"], "login_id": u["login_id"], "name": u["display_name"], "department": u["department"],
                            "job": u["job"], "is_active": bool(u["is_active"]), "left_on": u["left_on"],
                            "level": flags[0]["level"], "at": max(f["at"] for f in flags), "flags": flags})
    # 등급이 높은 사람부터, 같은 등급은 최근 일이 있는 사람부터 (안정 정렬 두 번).
    out.sort(key=lambda p: p["at"], reverse=True)
    out.sort(key=lambda p: -LEVEL_RANK[p["level"]])
    return out


def expired_grants(db: Database) -> list[dict[str, Any]]:
    """WATCH_DAYS 안에 사용 기간이 끝났는데 회수 기록이 없는 일반 사용자의 권한과 그 사람입니다."""
    day = today()
    since = (date.fromisoformat(day) - timedelta(days=WATCH_DAYS)).isoformat()
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT r.request_no, r.requested_access, r.period_end, u.id, u.login_id, u.display_name, u.department, u.job,"
            " u.is_active, u.left_on FROM access_requests r JOIN users u ON u.id = r.requester_id"
            " WHERE r.stage = 'approved' AND r.period_end <> '' AND r.period_end < %s AND r.period_end >= %s AND u.role = 'user'"
            " ORDER BY r.period_end DESC", (day, since)).fetchall()
    return [dict(r) for r in rows]


def log_ids(db: Database, user_ids: list[int]) -> dict[int, str]:
    """계정 id → 로그 사용자 ID (적지 않은 계정은 뺍니다)."""
    if not user_ids:
        return {}
    with db.connection() as conn:
        rows = conn.execute("SELECT id, log_id FROM users WHERE id = ANY(%s) AND log_id <> ''", (user_ids,)).fetchall()
    return {r["id"]: r["log_id"] for r in rows}


def _move_text(m: Any) -> str:
    side = lambda d, j: f"{d or '부서 없음'}{f'({j})' if j else ''}"  # noqa: E731
    return f"{m['moved_on']} {side(m['from_department'], m['from_job'])} → {side(m['to_department'], m['to_job'])}"


def pending_grant_reviews(db: Database, user_id: int | None = None) -> list[str]:
    """이동 뒤 재검토가 없는 보유 권한의 작업 이름("grant:신청번호:이동 id") — 퇴사자는 뺍니다."""
    out = []
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT r.* FROM access_requests r JOIN users u ON u.id = r.requester_id"
            " WHERE r.stage = 'approved' AND (r.period_end = '' OR r.period_end >= %s) AND (u.left_on = '' OR u.left_on > %s)"
            + (" AND r.requester_id = %s" if user_id is not None else "") + " ORDER BY r.id",
            (today(), today(), *((user_id,) if user_id is not None else ()))).fetchall()
        for r in rows:
            move = _latest_move(conn, r["requester_id"], r["submitted_at"])
            if move and not conn.execute("SELECT 1 FROM grant_reviews WHERE request_id = %s AND move_id = %s AND failed = 0",
                                         (r["id"], move["id"])).fetchone():
                out.append(f"grant:{r['request_no']}:{move['id']}")
    return out


def grant_input(db: Database, request_no: str, move_id: int) -> dict[str, Any] | None:
    """회수 · 만료됐거나 더 늦은 이동이 있으면 None 입니다."""
    with db.connection() as conn:
        row = conn.execute(
            "SELECT r.*, c.system AS access_system, c.category AS access_category, c.description AS access_description"
            " FROM access_requests r LEFT JOIN access_catalog c ON c.code = r.access_code WHERE r.request_no = %s",
            (request_no,)).fetchone()
        if row is None or not _is_held(row):
            return None
        move = _latest_move(conn, row["requester_id"], row["submitted_at"])
        if move is None or move["id"] != move_id:
            return None
        return {**dict(row), "move": _move(move)}


def save_grant_review(db: Database, request_no: str, move_id: int, result: dict, model: str) -> bool:
    """그사이 회수 · 만료됐으면 쓰지 않고 False 입니다."""
    with db.transaction() as conn:
        row = _row(conn, request_no)
        if not _is_held(row):
            return False
        conn.execute(
            "INSERT INTO grant_reviews (request_id, move_id, level, reason, recommendation, sources, failed, error, model,"
            " elapsed_sec, judged_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (row["id"], move_id, result.get("level"), result.get("reason", ""), result.get("recommendation", ""),
             json.dumps(result.get("sources", []), ensure_ascii=False), int(result["failed"]), result.get("error"),
             model, result.get("elapsed_sec"), now()))
    return True


def _can_view(by: User, req: Row) -> bool:
    return by.role in ("manager", "top") or req["requester_id"] == by.id


def get(db: Database, by: User, request_no: str) -> dict:
    with db.connection() as conn:
        req = _row(conn, request_no)
        if not _can_view(by, req):
            raise Denied("볼 수 없는 신청입니다")
        return _detail(conn, req["id"])


def list_requests(db: Database, by: User, stage: str | None = None, mine: bool = False) -> list[dict]:
    """일반 사용자는 자기 신청만 봅니다."""
    if stage is not None and stage not in STAGES:
        raise Denied(f"stage 는 {', '.join(STAGES)} 중 하나입니다")
    where, args = [], []
    if mine or by.role == "user":
        where.append("requester_id = %s"); args.append(by.id)
    if stage:
        where.append("stage = %s"); args.append(stage)
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
        conn.execute("UPDATE access_requests SET stage = 'withdrawn', closed_at = %s WHERE id = %s", (now(), req["id"]))
        audit(conn, "request_withdraw", by.id, target_type="request", target_id=request_no)
        return _detail(conn, req["id"])


def _person(conn: psycopg.Connection[Row], by: User) -> Row:
    return conn.execute("SELECT id, display_name, department FROM users WHERE id = %s", (by.id,)).fetchone()


def decide(db: Database, by: User, request_no: str, action: str, comment: str = "") -> dict:
    """단계는 결재자의 역할로 정합니다 (보안 운영자 = 1차, 보안 총책임자 = 최종)."""
    if action not in ("approve", "reject"):
        raise Denied("action 은 approve · reject 중 하나입니다")
    if by.role not in ("manager", "top"):
        raise Denied("결재할 수 있는 역할이 아닙니다")
    step = by.role
    with db.transaction() as conn:
        req = _row(conn, request_no)
        person = _person(conn, by)
        conn.execute(
            f"UPDATE access_requests SET {step}_action = %s, {step}_comment = %s, {step}_id = %s, {step}_name = %s,"
            f" {step}_department = %s, {step}_decided_at = %s WHERE id = %s",
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
            "UPDATE access_requests SET revoke_reason = %s, revoker_id = %s, revoker_name = %s, revoker_department = %s, revoked_at = %s"
            " WHERE id = %s",
            (reason.strip(), person["id"], person["display_name"], person["department"], now(), req["id"]),
        )
        audit(conn, "request_revoke", by.id, target_type="request", target_id=request_no)
        return _detail(conn, req["id"])


# --- 보안 통계 ---


def request_stats(db: Database, since: str | None = None) -> dict[str, Any]:
    """신청 수 · AI 등급별 수 · AI 와 결재가 엇갈린 수입니다. since 가 없으면 전체입니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT stage, ai_level, ai_failed, ai_judged_at FROM access_requests"
            + (" WHERE submitted_at >= %s" if since else ""), (since,) if since else ()).fetchall()
    totals: dict[str, int] = {}
    mismatches = 0
    for r in rows:
        ai = "판정 없음" if r["ai_judged_at"] is None else "판정 실패" if r["ai_failed"] else r["ai_level"]
        totals[ai] = totals.get(ai, 0) + 1
        # 회수는 최종 승인을 거친 것이라 결재 결과로는 승인입니다.
        approved, rejected = r["stage"] in ("approved", "revoked"), r["stage"] == "rejected"
        mismatches += (ai == "위험" and approved) or (ai == "정상" and rejected)
    return {"total": len(rows), "ai": totals, "mismatches": mismatches}


def user_requests(db: Database, since: str | None = None) -> list[dict[str, Any]]:
    """의심 점수용 — 기간 안 신청을 신청자 계정별로 묶습니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT request_no, requester_id, requested_access, stage, ai_level, ai_failed, ai_judged_at, manager_action, top_action,"
            " revoke_reason, submitted_at FROM access_requests" + (" WHERE submitted_at >= %s" if since else "") + " ORDER BY submitted_at",
            (since,) if since else ()).fetchall()
    return [{"request_no": r["request_no"], "account_id": r["requester_id"], "access": r["requested_access"], "stage": r["stage"],
             "ai": None if r["ai_judged_at"] is None or r["ai_failed"] else r["ai_level"],
             "rejected_by": "최종" if r["top_action"] == "reject" else "1차" if r["manager_action"] == "reject" else None,
             "revoke_reason": r["revoke_reason"], "at": r["submitted_at"]} for r in rows]


def held_by_account(db: Database) -> dict[int, list[dict[str, Any]]]:
    """계정마다 지금 가진 권한 (_held 와 같은 조건)입니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT r.requester_id, r.request_no, r.access_code, r.requested_access, r.period_end, c.system, c.category"
            " FROM access_requests r LEFT JOIN access_catalog c ON c.code = r.access_code"
            " WHERE r.stage = 'approved' AND (r.period_end = '' OR r.period_end >= %s) ORDER BY r.submitted_at", (today(),)).fetchall()
    out: dict[int, list[dict[str, Any]]] = {}
    for r in rows:
        out.setdefault(r["requester_id"], []).append({"request_no": r["request_no"], "code": r["access_code"], "access": r["requested_access"],
                                                      "system": r["system"] or "", "category": r["category"] or "", "period_end": r["period_end"]})
    return out


# --- AI 판정 (신청 행의 AI 칸) ---


def save_ai_verdict(db: Database, request_no: str, result: dict, model: str) -> bool:
    """그사이 1차 결재가 났으면 쓰지 않고 False 입니다."""
    with db.transaction() as conn:
        updated = conn.execute(
            "UPDATE access_requests SET ai_level = %s, ai_reason = %s, ai_recommendation = %s, ai_sources = %s, ai_failed = %s,"
            " ai_error = %s, ai_model = %s, ai_elapsed_sec = %s, ai_judged_at = %s"
            " WHERE request_no = %s AND stage = 'manager' AND manager_action IS NULL",
            (result.get("level"), result.get("reason", ""), result.get("recommendation", ""),
             json.dumps(result.get("sources", []), ensure_ascii=False), int(result["failed"]), result.get("error"),
             model, result.get("elapsed_sec"), now(), request_no),
        ).rowcount
    return updated == 1


def account_record(db: Database, user_id: int, before: str | None = None) -> dict[str, Any] | None:
    """사람이 정한 것만 담습니다 (예전 AI 등급의 되먹임 방지). before 가 있으면 그 뒤의 이동 · 신청을 뺍니다."""
    with db.connection() as conn:
        user = conn.execute("SELECT id, display_name, department, job, role, is_active, left_on, log_id, created_at FROM users WHERE id = %s",
                            (user_id,)).fetchone()
        if user is None:
            return None
        moves = [_move(m) for m in conn.execute("SELECT * FROM user_moves WHERE user_id = %s" + (" AND recorded_at <= %s" if before else "")
                                                + " ORDER BY id", (user_id, *((before,) if before else ())))]
        held = [dict(r) for r in _held(conn, user_id)]
        rows = conn.execute(
            "SELECT request_no, requested_access, reason, period_end, stage, manager_action, manager_comment, top_action, top_comment,"
            " revoke_reason, submitted_at FROM access_requests WHERE requester_id = %s" + (" AND submitted_at < %s" if before else "")
            + " ORDER BY submitted_at DESC", (user_id, *((before,) if before else ()))).fetchall()
    requests = []
    for r in rows:
        rejected = "최종" if r["top_action"] == "reject" else "1차" if r["manager_action"] == "reject" else None
        requests.append({"at": r["submitted_at"], "access": r["requested_access"], "reason": r["reason"], "stage": STAGE_TEXT[r["stage"]],
                         "rejected_by": rejected,
                         "comment": (r["top_comment"] if rejected == "최종" else r["manager_comment"]) if rejected else None,
                         "revoke_reason": r["revoke_reason"]})
    return {**dict(user), "moves": moves, "held": held, "requests": requests}


def judge_input(db: Database, request_no: str) -> dict[str, Any] | None:
    """신청 판정 입력 — 신청 행 · 권한 설명 · 신청 전 90일 안의 이동(없으면 None)입니다."""
    with db.connection() as conn:
        row = conn.execute(
            "SELECT r.*, c.system AS access_system, c.category AS access_category, c.description AS access_description"
            " FROM access_requests r LEFT JOIN access_catalog c ON c.code = r.access_code WHERE r.request_no = %s",
            (request_no,)).fetchone()
        if row is None:
            return None
        since = (date.fromisoformat(row["submitted_at"][:10]) - timedelta(days=RECENT_MOVE_DAYS)).isoformat()
        move = conn.execute("SELECT * FROM user_moves WHERE user_id = %s AND recorded_at <= %s AND moved_on >= %s ORDER BY id DESC LIMIT 1",
                            (row["requester_id"], row["submitted_at"], since)).fetchone()
        return {**dict(row), "move": _move(move) if move else None}


def rejudgeable(db: Database, request_no: str) -> bool:
    with db.connection() as conn:
        return _row(conn, request_no)["stage"] == "manager"


def unjudged(db: Database) -> list[str]:
    """1차 결재 전인데 성공한 판정이 없는 신청입니다 (재시작 때 다시 돌림)."""
    with db.connection() as conn:
        return [r[0] for r in conn.execute(
            "SELECT request_no FROM access_requests WHERE stage = 'manager' AND (ai_judged_at IS NULL OR ai_failed = 1)"
            " ORDER BY id")]

