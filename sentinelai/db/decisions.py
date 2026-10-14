"""정책 관리(정책 문제 · 서버 점검) · 로그 감시의 운영자 결정 (권한 DB).

결정은 고치거나 지우지 않고 쌓습니다. 항목마다 마지막 기록이 지금 결정이고, 취소도 cancel 기록으로 남깁니다.
"""
from __future__ import annotations

import json

from .auth import User
from .core import Database, Denied, audit, now

ACTIONS = {"policy": ("approve", "cond", "reject"), "event": ("clear", "act"), "server": ("clear", "act")}


def record(db: Database, by: User, kind: str, item_key: str, action: str, subject: str = "",
           comment: str = "", ai_level: str | None = None) -> dict | None:
    if kind not in ACTIONS:
        raise Denied(f"kind 는 {' · '.join(ACTIONS)} 중 하나입니다")
    if action != "cancel" and action not in ACTIONS[kind]:
        raise Denied(f"action 은 {', '.join(ACTIONS[kind])} · cancel 중 하나입니다")
    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO review_decisions (kind, item_key, subject, action, comment, ai_level, decider_id, decider_name,"
            " decider_department, decided_at)"
            " SELECT ?, ?, ?, ?, ?, ?, id, display_name, department, ? FROM users WHERE id = ?",
            (kind, item_key, subject.strip(), action, comment.strip(), ai_level, now(), by.id),
        )
        audit(conn, f"{kind}_decision", by.id, target_type=kind, target_id=item_key,
              detail=json.dumps({"action": action, "ai_level": ai_level}, ensure_ascii=False))
    return current(db, kind).get(item_key)


def current(db: Database, kind: str) -> dict[str, dict]:
    """항목 key → 지금 결정. 마지막 기록이 취소면 결정이 없는 것으로 봅니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT d.* FROM review_decisions d"
            " JOIN (SELECT item_key, max(id) AS id FROM review_decisions WHERE kind = ? GROUP BY item_key) last ON d.id = last.id",
            (kind,),
        ).fetchall()
    return {r["item_key"]: dict(r) for r in rows if r["action"] != "cancel"}


def history(db: Database, kind: str) -> dict[str, list[dict]]:
    """항목 key → 결정 기록 전부 (오래된 것부터, 취소 포함). 최상급자가 아래에서 올라온 판단을 읽을 때 씁니다."""
    with db.connection() as conn:
        rows = conn.execute("SELECT * FROM review_decisions WHERE kind = ? ORDER BY id", (kind,)).fetchall()
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(r["item_key"], []).append(dict(r))
    return out

