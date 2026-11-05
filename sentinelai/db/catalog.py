"""권한 목록 — 지난 신청이 코드를 가리키므로 지우지 않고 코드도 바꾸지 않습니다."""
from __future__ import annotations

import json
import re

import psycopg

from .auth import User
from .core import Database, Denied, Row, audit, now

FIELDS = ("name", "system", "category", "description")


def _top(by: User) -> None:
    if by.role != "top":
        raise Denied("권한 목록은 보안 총책임자만 관리할 수 있습니다")


def _item(row: Row) -> dict:
    return {**dict(row), "is_active": bool(row["is_active"])}


def list_items(db: Database, by: User) -> list[dict]:
    """보안 총책임자에게만 꺼진 권한까지 줍니다."""
    sql = "SELECT * FROM access_catalog" + ("" if by.role == "top" else " WHERE is_active = 1") + " ORDER BY system, name, code"
    with db.connection() as conn:
        return [_item(r) for r in conn.execute(sql)]


def get(conn: psycopg.Connection[Row], code: str) -> Row:
    row = conn.execute("SELECT * FROM access_catalog WHERE code = %s", (code,)).fetchone()
    if row is None:
        raise Denied("권한 목록에 없는 권한입니다")
    return row


def create(db: Database, by: User, code: str, name: str, system: str = "", category: str = "", description: str = "") -> dict:
    _top(by)
    code, name = code.strip(), name.strip()
    if not code or not name:
        raise Denied("권한 코드와 이름을 적어 주세요")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", code):
        raise Denied("권한 코드는 영문 · 숫자 · _ . - 만 64자까지 씁니다 (예: HR_SALARY_READ)")
    with db.transaction() as conn:
        if conn.execute("SELECT 1 FROM access_catalog WHERE code = %s", (code,)).fetchone():
            raise Denied("이미 있는 권한 코드입니다")
        stamp = now()
        conn.execute(
            "INSERT INTO access_catalog (code, name, system, category, description, created_by, created_at, updated_at)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (code, name, system.strip(), category.strip(), description.strip(), by.id, stamp, stamp),
        )
        audit(conn, "access_create", by.id, target_type="access", target_id=code)
        return _item(get(conn, code))


def update(db: Database, by: User, code: str, **changes) -> dict:
    """이미 낸 신청에는 신청 때 이름이 남습니다."""
    _top(by)
    unknown = set(changes) - {*FIELDS, "is_active"}
    if unknown:
        raise Denied(f"바꿀 수 없는 칸입니다: {', '.join(sorted(unknown))}")
    values = {k: (v.strip() if isinstance(v, str) else int(bool(v))) for k, v in changes.items()}
    if values.get("name") == "":
        raise Denied("권한 이름을 적어 주세요")
    with db.transaction() as conn:
        get(conn, code)
        if values:
            sets = ", ".join(f"{k} = %s" for k in values)
            conn.execute(f"UPDATE access_catalog SET {sets}, updated_at = %s WHERE code = %s", (*values.values(), now(), code))
            audit(conn, "access_update", by.id, target_type="access", target_id=code,
                  detail=json.dumps(values, ensure_ascii=False))
        return _item(get(conn, code))
