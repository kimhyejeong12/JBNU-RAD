"""수집 노드 등록부 (권한 DB).

보안 운영자 · 보안 총책임자가 화면에서 노드(서버)를 등록하면 그 노드만의 키가 나옵니다. 내부망 서비스라 키를 그대로도 두어
화면에서 언제든 다시 볼 수 있습니다 (10/20 결정). 새어 나가면 다시 발급합니다 (예전 키는 그때 못 쓰게 됨).
노드는 이름 없이 키만 보내고, 서버가 키의 해시로 어느 노드인지 찾습니다.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from .auth import User
from .core import Database, Denied, audit, now


class Unauthorized(Denied):
    """키가 맞지 않음 (401)."""


NAME = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
# 수집 받기 주소(/api/nodes/snapshots)와 겹치지 않게 쓰지 못하는 이름입니다.
RESERVED = {"snapshots"}


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _row(r: Any) -> dict[str, Any]:
    return {k: r[k] for k in ("name", "host", "ip", "agent_version", "interval_min", "registered_at", "last_seen_at",
                               "last_collected_at")} | {"enabled": bool(r["enabled"]), "key_issued": r["key_hash"] is not None}


def authenticate(db: Database, presented: str, info: dict[str, Any]) -> dict[str, Any]:
    """노드가 보낸 키로 노드를 찾습니다. 없는 키는 Unauthorized, 꺼진 노드는 Denied.

    info = 본문의 host · ip · agent_version · interval_min (등록부에 마지막 값을 둡니다).
    """
    fields = {"host": str(info.get("host", "")), "ip": str(info.get("ip", "")),
              "agent_version": str(info.get("agent_version", "")), "interval_min": int(info.get("interval_min") or 0)}
    with db.transaction() as conn:
        # 키는 32바이트 무작위 값이라 해시를 그대로 찾아도 됩니다 (비밀번호처럼 느린 해시가 필요 없음).
        row = conn.execute("SELECT * FROM nodes WHERE key_hash = ?", (_hash(presented),)).fetchone()
        if row is None:
            raise Unauthorized("등록되지 않은 키입니다 — 정책 관리 → [노드]에서 발급한 키를 node.conf 에 넣으세요")
        if not row["enabled"]:
            raise Denied("꺼 둔 노드입니다")
        conn.execute(f"UPDATE nodes SET {', '.join(f'{k} = ?' for k in fields)}, last_seen_at = ? WHERE id = ?",
                     (*fields.values(), now(), row["id"]))
        return _row(conn.execute("SELECT * FROM nodes WHERE id = ?", (row["id"],)).fetchone())


def create(db: Database, by: User, name: str) -> tuple[dict[str, Any], str]:
    """노드를 등록하고 키를 발급합니다. → (노드, 키). 키는 지금 한 번만 돌려주고 해시만 남깁니다."""
    _require_analyst(by)
    if not NAME.match(name) or name in RESERVED:
        raise Denied("노드 이름은 영문 · 숫자 · . _ - 1~64자입니다" + (" (쓸 수 없는 이름)" if name in RESERVED else ""))
    key = secrets.token_urlsafe(32)
    with db.transaction() as conn:
        if conn.execute("SELECT 1 FROM nodes WHERE name = ?", (name,)).fetchone():
            raise Denied("이미 있는 노드 이름입니다")
        conn.execute("INSERT INTO nodes (name, key_hash, key, registered_at) VALUES (?,?,?,?)", (name, _hash(key), key, now()))
        audit(conn, "node_create", by.id, target_type="node", target_id=name)
        return _row(conn.execute("SELECT * FROM nodes WHERE name = ?", (name,)).fetchone()), key


def reissue_key(db: Database, by: User, name: str) -> tuple[dict[str, Any], str]:
    """키를 다시 발급합니다. 예전 키는 바로 못 쓰게 됩니다. → (노드, 새 키)"""
    key = secrets.token_urlsafe(32)
    return _change(db, by, name, "UPDATE nodes SET key_hash = ?, key = ? WHERE name = ?", (_hash(key), key), "node_key_issue", {}), key


def key_of(db: Database, by: User, name: str) -> str | None:
    """화면에 보여줄 노드 키. 10/20 오후 전에 발급해 해시만 있는 키는 None (다시 발급하면 보임)."""
    _require_analyst(by)
    with db.connection() as conn:
        row = conn.execute("SELECT key FROM nodes WHERE name = ?", (name,)).fetchone()
    return row["key"] if row else None


def ensure(db: Database, name: str, info: dict[str, Any]) -> None:
    """손으로 넣은 수집(import-snapshots)의 노드를 등록부에 둡니다. 키는 주지 않습니다 — 그 노드가 직접 보내려면 화면에서 키를 발급합니다."""
    with db.transaction() as conn:
        if conn.execute("SELECT 1 FROM nodes WHERE name = ?", (name,)).fetchone() is None:
            conn.execute("INSERT INTO nodes (name, host, ip, registered_at) VALUES (?,?,?,?)",
                         (name, str(info.get("host", "")), str(info.get("ip", "")), now()))
            audit(conn, "node_import", target_type="node", target_id=name)


def mark_collected(db: Database, name: str, collected_at: str) -> None:
    with db.transaction() as conn:
        conn.execute("UPDATE nodes SET last_collected_at = max(coalesce(last_collected_at, ''), ?) WHERE name = ?",
                     (collected_at, name))


def list_nodes(db: Database) -> list[dict[str, Any]]:
    with db.connection() as conn:
        return [_row(r) for r in conn.execute("SELECT * FROM nodes ORDER BY name")]


def enabled_names(db: Database) -> set[str]:
    with db.connection() as conn:
        return {r["name"] for r in conn.execute("SELECT name FROM nodes WHERE enabled = 1")}


def _require_analyst(by: User) -> None:
    if by.role not in ("manager", "top"):
        raise Denied("노드 관리는 보안 운영자 · 보안 총책임자만 할 수 있습니다")


def _change(db: Database, by: User, name: str, sql: str, args: tuple, action: str, detail: dict) -> dict[str, Any]:
    _require_analyst(by)
    with db.transaction() as conn:
        if conn.execute("SELECT 1 FROM nodes WHERE name = ?", (name,)).fetchone() is None:
            raise Denied("없는 노드입니다")
        conn.execute(sql, (*args, name))
        audit(conn, action, by.id, target_type="node", target_id=name, detail=json.dumps(detail, ensure_ascii=False))
        return _row(conn.execute("SELECT * FROM nodes WHERE name = ?", (name,)).fetchone())


def set_enabled(db: Database, by: User, name: str, enabled: bool) -> dict[str, Any]:
    """끈 노드는 보내도 받지 않고, 주기 점검에서도 빠집니다."""
    return _change(db, by, name, "UPDATE nodes SET enabled = ? WHERE name = ?", (int(enabled),), "node_update", {"enabled": enabled})


def is_stale(node: dict[str, Any], at: datetime | None = None) -> bool:
    """노드가 정한 간격의 세 배가 넘도록 소식이 없으면 끊긴 것으로 봅니다."""
    if not node["last_seen_at"] or not node["interval_min"]:
        return False
    seen = datetime.fromisoformat(node["last_seen_at"])
    return (at or datetime.now(timezone.utc)) - seen > timedelta(minutes=node["interval_min"] * 3)
