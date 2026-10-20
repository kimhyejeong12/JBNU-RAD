"""수집 노드 등록부 (권한 DB).

노드는 처음 보낼 때 공용 등록 토큰(SENTINELAI_NODE_TOKEN)으로 스스로 등록하고, 그때 받은 이 노드만의 키로 이후를 보냅니다.
이름은 한 번 등록되면 그 키로만 쓸 수 있어 다른 서버가 같은 이름으로 끼어들 수 없습니다.
노드를 다시 깔아 키를 잃으면 보안 운영자 · 보안 총책임자가 키를 초기화하고, 노드가 등록 토큰으로 다시 받습니다.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from .auth import User
from .core import Database, Denied, audit, now


class Unauthorized(Denied):
    """토큰 · 키가 맞지 않음 (401)."""


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _row(r: Any) -> dict[str, Any]:
    return {k: r[k] for k in ("name", "host", "ip", "agent_version", "interval_min", "registered_at", "last_seen_at",
                               "last_collected_at")} | {"enabled": bool(r["enabled"]), "key_issued": r["key_hash"] is not None}


def authenticate(db: Database, name: str, presented: str, enroll_token: str, info: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    """노드 요청을 확인합니다. → (노드, 새로 준 키 또는 None). 맞지 않으면 Unauthorized, 꺼진 노드는 Denied.

    처음 보는 이름 · 키를 초기화한 노드는 등록 토큰으로만, 그 밖에는 이 노드의 키로만 받습니다.
    info = 본문의 host · ip · agent_version · interval_min (등록부에 마지막 값을 둡니다).
    """
    fields = {"host": str(info.get("host", "")), "ip": str(info.get("ip", "")),
              "agent_version": str(info.get("agent_version", "")), "interval_min": int(info.get("interval_min") or 0)}
    with db.transaction() as conn:
        row = conn.execute("SELECT * FROM nodes WHERE name = ?", (name,)).fetchone()
        key = None
        if row is None or row["key_hash"] is None:
            if not hmac.compare_digest(presented, enroll_token):
                raise Unauthorized("등록되지 않은 노드입니다 — 등록 토큰(SENTINELAI_NODE_TOKEN)으로 보내세요"
                                   if row is None else "키를 초기화한 노드입니다 — 등록 토큰으로 다시 보내세요")
            key = secrets.token_urlsafe(32)
            if row is None:
                conn.execute("INSERT INTO nodes (name, key_hash, registered_at) VALUES (?,?,?)", (name, _hash(key), now()))
            else:
                conn.execute("UPDATE nodes SET key_hash = ? WHERE name = ?", (_hash(key), name))
            audit(conn, "node_register", target_type="node", target_id=name, detail=json.dumps(fields, ensure_ascii=False),
                  ip=fields["ip"] or None)
        elif not hmac.compare_digest(_hash(presented), row["key_hash"]):
            raise Unauthorized("이 노드의 키가 아닙니다 — 다시 깔았다면 화면에서 키를 초기화하세요")
        if row is not None and not row["enabled"]:
            raise Denied("꺼 둔 노드입니다")
        conn.execute(f"UPDATE nodes SET {', '.join(f'{k} = ?' for k in fields)}, last_seen_at = ? WHERE name = ?",
                     (*fields.values(), now(), name))
        node = conn.execute("SELECT * FROM nodes WHERE name = ?", (name,)).fetchone()
    return _row(node), key


def ensure(db: Database, name: str, info: dict[str, Any]) -> None:
    """손으로 넣은 수집(import-snapshots)의 노드를 등록부에 둡니다. 키는 주지 않아, 그 노드가 나중에 보내면 등록 토큰으로 받습니다."""
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


def reset_key(db: Database, by: User, name: str) -> dict[str, Any]:
    """키를 지웁니다. 노드가 다음에 등록 토큰으로 보내면 새 키를 받습니다."""
    return _change(db, by, name, "UPDATE nodes SET key_hash = NULL WHERE name = ?", (), "node_reset_key", {})


def is_stale(node: dict[str, Any], at: datetime | None = None) -> bool:
    """노드가 정한 간격의 세 배가 넘도록 소식이 없으면 끊긴 것으로 봅니다."""
    if not node["last_seen_at"] or not node["interval_min"]:
        return False
    seen = datetime.fromisoformat(node["last_seen_at"])
    return (at or datetime.now(timezone.utc)) - seen > timedelta(minutes=node["interval_min"] * 3)
