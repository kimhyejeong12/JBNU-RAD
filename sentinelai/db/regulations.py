"""기준 문서 원문 — 화면에서 보안 총책임자가 올리고 고치고 지웁니다. 지난 원문은 부르는 쪽이 감사 기록에 남깁니다."""
from __future__ import annotations

from .auth import User
from .core import Database, Denied, now


def _check(by: User | None) -> None:
    if by is not None and by.role != "top":
        raise Denied("기준 문서는 보안 총책임자만 관리할 수 있습니다")


def texts(db: Database) -> dict[str, str]:
    """이름 → 원문 (이름 순)"""
    with db.connection() as conn:
        return {r["name"]: r["content"] for r in conn.execute("SELECT name, content FROM regulations ORDER BY name")}


def list_all(db: Database) -> list[dict]:
    with db.connection() as conn:
        return [dict(r) for r in conn.execute("SELECT name, content, updated_at FROM regulations ORDER BY name")]


def get(db: Database, name: str) -> dict | None:
    with db.connection() as conn:
        row = conn.execute("SELECT name, content, updated_at FROM regulations WHERE name = %s", (name,)).fetchone()
    return dict(row) if row else None


def create(db: Database, by: User | None, name: str, content: str) -> bool:
    """같은 이름이 있으면 덮어쓰지 않고 False. by 가 없으면 CLI 옮겨 넣기입니다."""
    _check(by)
    with db.transaction() as conn:
        cur = conn.execute(
            "INSERT INTO regulations (name, content, updated_at, updated_by) VALUES (%s,%s,%s,%s) ON CONFLICT (name) DO NOTHING",
            (name, content, now(), by.id if by else None),
        )
        return cur.rowcount == 1


def update(db: Database, by: User, name: str, content: str) -> None:
    _check(by)
    with db.transaction() as conn:
        conn.execute("UPDATE regulations SET content = %s, updated_at = %s, updated_by = %s WHERE name = %s",
                     (content, now(), by.id, name))


def delete(db: Database, by: User, name: str) -> None:
    _check(by)
    with db.transaction() as conn:
        conn.execute("DELETE FROM regulations WHERE name = %s", (name,))


def restore(db: Database, name: str, content: str | None) -> None:
    """적재에 실패한 변경을 되돌립니다 — content 가 None 이면 그 이름을 지웁니다."""
    with db.transaction() as conn:
        if content is None:
            conn.execute("DELETE FROM regulations WHERE name = %s", (name,))
        else:
            conn.execute(
                "INSERT INTO regulations (name, content, updated_at) VALUES (%s,%s,%s) "
                "ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content", (name, content, now()))
