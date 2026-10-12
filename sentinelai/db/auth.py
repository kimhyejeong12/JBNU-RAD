"""사용자 · 로그인 · 세션 (권한 DB).

계정은 루트만 만듭니다(트리거가 강제). 초기 루트만 웹 밖에서 create_root 로 만듭니다.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.profiles import RFC_9106_LOW_MEMORY

from .core import Database, Denied, audit, now

HASHER = PasswordHasher.from_parameters(RFC_9106_LOW_MEMORY)
SESSION_TTL = timedelta(days=2)
MAX_FAILED_LOGINS = 5
LOCK_TIME = timedelta(minutes=15)
ROLES = ("top", "manager", "user")

# 없는 ID 로 로그인할 때도 같은 시간이 걸리게 대신 검증할 해시입니다. 응답 시간으로 계정 유무가 드러나지 않습니다.
_DUMMY_HASH = HASHER.hash(secrets.token_urlsafe(16))


@dataclass(frozen=True)
class User:
    id: int
    login_id: str
    display_name: str
    department: str
    role: str
    is_root: bool
    must_change_password: bool

    @classmethod
    def of(cls, row: sqlite3.Row) -> User:
        return cls(row["id"], row["login_id"], row["display_name"], row["department"], row["role"],
                   bool(row["is_root"]), bool(row["must_change_password"]))

    def public(self) -> dict:
        return {
            "id": self.id, "login_id": self.login_id, "display_name": self.display_name,
            "department": self.department, "role": self.role, "is_root": self.is_root,
            "must_change_password": self.must_change_password,
        }


def _check_password(password: str) -> None:
    if not password:
        raise Denied("비밀번호를 입력하세요")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _later(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat(timespec="seconds")


def create_root(db: Database, login_id: str, password: str, display_name: str, department: str = "") -> User:
    _check_password(password)
    with db.transaction() as conn:
        if conn.execute("SELECT 1 FROM users WHERE is_root = 1").fetchone():
            raise Denied("루트 계정이 이미 있습니다")
        uid = conn.execute(
            "INSERT INTO users (login_id, password_hash, display_name, department, role, is_root, must_change_password, created_at)"
            " VALUES (?, ?, ?, ?, 'top', 1, 0, ?)",
            (login_id, HASHER.hash(password), display_name, department, now()),
        ).lastrowid
        audit(conn, "root_create", uid, login_id=login_id, target_type="user", target_id=str(uid))
        return User.of(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())


def _require_root(by: User) -> None:
    if not by.is_root:
        raise Denied("계정 관리는 루트만 할 수 있습니다")


def create_user(db: Database, by: User, login_id: str, password: str, display_name: str, department: str, role: str) -> User:
    _require_root(by)
    if role not in ROLES:
        raise Denied(f"역할은 {', '.join(ROLES)} 중 하나입니다")
    _check_password(password)
    with db.transaction() as conn:
        uid = conn.execute(
            "INSERT INTO users (login_id, password_hash, display_name, department, role, created_at, created_by)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (login_id, HASHER.hash(password), display_name, department, role, now(), by.id),
        ).lastrowid
        audit(conn, "user_create", by.id, target_type="user", target_id=str(uid),
              detail=json.dumps({"login_id": login_id, "role": role, "department": department}, ensure_ascii=False))
        return User.of(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())


def update_user(db: Database, by: User, user_id: int, **changes: object) -> User:
    """역할 · 부서 · 이름 · 활성 여부를 바꿉니다. 정지하면 그 사람의 세션도 끊습니다."""
    _require_root(by)
    allowed = {"display_name", "department", "role", "is_active"}
    fields = {k: v for k, v in changes.items() if k in allowed and v is not None}
    if not fields:
        raise Denied("바꿀 항목이 없습니다")
    if "role" in fields and fields["role"] not in ROLES:
        raise Denied(f"역할은 {', '.join(ROLES)} 중 하나입니다")
    with db.transaction() as conn:
        target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if target is None:
            raise Denied("없는 계정입니다")
        if target["is_root"] and ("role" in fields or fields.get("is_active") in (0, False)):
            raise Denied("루트의 역할을 바꾸거나 정지할 수 없습니다")
        conn.execute(f"UPDATE users SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?", (*fields.values(), user_id))
        if fields.get("is_active") in (0, False):
            conn.execute("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", (now(), user_id))
        audit(conn, "user_update", by.id, target_type="user", target_id=str(user_id),
              detail=json.dumps(fields, ensure_ascii=False))
        return User.of(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def reset_password(db: Database, by: User, user_id: int, temporary_password: str) -> None:
    """임시 비밀번호로 바꾸고 다음 로그인에 바꾸게 합니다. 기존 세션은 끊습니다."""
    _require_root(by)
    _check_password(temporary_password)
    with db.transaction() as conn:
        if conn.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?",
            (HASHER.hash(temporary_password), user_id),
        ).rowcount == 0:
            raise Denied("없는 계정입니다")
        conn.execute("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", (now(), user_id))
        audit(conn, "password_reset", by.id, target_type="user", target_id=str(user_id))


def list_users(db: Database, by: User) -> list[dict]:
    _require_root(by)
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT id, login_id, display_name, department, role, is_root, is_active, must_change_password,"
            " locked_until, last_login_at, created_at FROM users ORDER BY id"
        ).fetchall()
    return [dict(r) for r in rows]


def _login_failed(db: Database, user_id: int | None, login_id: str, ip: str | None, reason: str) -> bool:
    """실패를 기록합니다. 이번 실패로 잠겼으면 True"""
    with db.transaction() as conn:
        locked = False
        if reason == "password":
            # 동시에 틀려도 횟수가 빠지지 않게 SQL 안에서 더합니다.
            count = conn.execute("UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ? RETURNING failed_logins",
                                 (user_id,)).fetchone()[0]
            if count >= MAX_FAILED_LOGINS:
                conn.execute("UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?", (_later(LOCK_TIME), user_id))
                locked = True
        audit(conn, "login_failed", user_id, login_id=login_id, ip=ip, detail=json.dumps({"reason": reason, "locked": locked}))
        return locked


def login(db: Database, login_id: str, password: str, ip: str | None = None, user_agent: str | None = None) -> tuple[str, User]:
    """성공하면 (세션 토큰, 사용자). 토큰은 쿠키로만 주고 DB에는 해시만 둡니다."""
    failure = Denied("아이디 또는 비밀번호가 맞지 않습니다")
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE login_id = ?", (login_id,)).fetchone()
    if row is None:
        try:
            HASHER.verify(_DUMMY_HASH, password)
        except VerificationError:
            pass
        _login_failed(db, None, login_id, ip, "unknown")
        raise failure
    if row["locked_until"] and row["locked_until"] > now():
        _login_failed(db, row["id"], login_id, ip, "locked")
        raise Denied("로그인 실패가 반복돼 잠시 잠겼습니다. 나중에 다시 시도하세요")
    try:
        HASHER.verify(row["password_hash"], password)
    except (VerificationError, InvalidHashError):
        if _login_failed(db, row["id"], login_id, ip, "password"):
            raise Denied("로그인 실패가 반복돼 잠시 잠겼습니다. 나중에 다시 시도하세요") from None
        raise failure from None
    if not row["is_active"]:
        _login_failed(db, row["id"], login_id, ip, "inactive")
        raise Denied("정지된 계정입니다")
    updates: dict[str, object] = {"failed_logins": 0, "locked_until": None, "last_login_at": now()}
    if HASHER.check_needs_rehash(row["password_hash"]):
        updates["password_hash"] = HASHER.hash(password)
    token = secrets.token_urlsafe(32)
    with db.transaction() as conn:
        conn.execute(f"UPDATE users SET {', '.join(f'{k} = ?' for k in updates)} WHERE id = ?", (*updates.values(), row["id"]))
        stamp = now()
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?,?)",
            (_token_hash(token), row["id"], stamp, stamp, _later(SESSION_TTL), ip, user_agent),
        )
        audit(conn, "login", row["id"], login_id=login_id, ip=ip)
        return token, User.of(conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone())


def session_user(db: Database, token: str | None) -> User | None:
    """유효한 세션의 사용자. 만료 · 회수됐거나 계정이 정지됐으면 None"""
    if not token:
        return None
    with db.connection() as conn:
        row = conn.execute(
            "SELECT u.*, s.id AS session_id FROM sessions s JOIN users u ON u.id = s.user_id"
            " WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.is_active = 1",
            (_token_hash(token), now()),
        ).fetchone()
        if row is None:
            return None
        conn.execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (now(), row["session_id"]))
        return User.of(row)


def logout(db: Database, token: str | None) -> None:
    if not token:
        return
    with db.transaction() as conn:
        row = conn.execute("SELECT user_id FROM sessions WHERE token_hash = ? AND revoked_at IS NULL", (_token_hash(token),)).fetchone()
        if row:
            conn.execute("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", (now(), _token_hash(token)))
            audit(conn, "logout", row["user_id"])


def change_password(db: Database, user: User, current: str, new: str, token: str | None = None) -> None:
    """비밀번호를 바꾸고 지금 세션 말고는 모두 끊습니다."""
    _check_password(new)
    if new == current:
        raise Denied("새 비밀번호가 지금과 같습니다")
    with db.transaction() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user.id,)).fetchone()
        try:
            HASHER.verify(row["password_hash"], current)
        except (VerificationError, InvalidHashError):
            raise Denied("지금 비밀번호가 맞지 않습니다") from None
        stamp = now()
        conn.execute("UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ? WHERE id = ?",
                     (HASHER.hash(new), stamp, user.id))
        conn.execute("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash IS NOT ?",
                     (stamp, user.id, _token_hash(token) if token else None))
        audit(conn, "password_change", user.id)
