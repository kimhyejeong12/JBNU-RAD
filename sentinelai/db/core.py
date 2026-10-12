from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .. import ROOT

HERE = Path(__file__).resolve().parent

# 트리거는 한국어로 막습니다. 제약 조건 위반만 SQLite 원문이라 화면에 보일 문장으로 바꿉니다.
_CONSTRAINT_TEXT = {
    "UNIQUE constraint failed: users.login_id": "이미 있는 아이디입니다",
    "UNIQUE constraint failed: users.is_root": "루트 계정이 이미 있습니다",
    "UNIQUE constraint failed: access_requests.request_no": "신청 번호가 겹쳤습니다. 다시 신청하세요",
    "FOREIGN KEY constraint failed": "없는 계정 · 신청을 가리킵니다",
}


def _readable(exc: sqlite3.IntegrityError) -> str:
    text = str(exc)
    if text in _CONSTRAINT_TEXT:
        return _CONSTRAINT_TEXT[text]
    if text.startswith("CHECK constraint failed"):
        return "허용되지 않는 값입니다"
    return text


class Denied(Exception):
    """규칙에 막힌 요청. 화면에 그대로 보여줄 수 있는 문장을 담습니다."""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    """SQLite 파일 하나. 요청마다 연결을 새로 열어 스레드 간에 연결을 나눠 쓰지 않습니다."""

    def __init__(self, path: str | Path, *schemas: str) -> None:
        path = Path(path)
        self.path = path if path.is_absolute() else ROOT / path
        self.schemas = [HERE / s for s in schemas]

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        return conn

    def init(self) -> None:
        """아직 적용하지 않은 스키마 파일을 차례로 적용합니다. n번째 파일을 적용하면 user_version 이 n 입니다."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as conn:
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version == 0:
                conn.execute("PRAGMA journal_mode = WAL")
            for n, schema in enumerate(self.schemas[version:], start=version + 1):
                conn.executescript(f"BEGIN;{schema.read_text(encoding='utf-8')}PRAGMA user_version = {n}; COMMIT;")

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = self.connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """쓰기 트랜잭션. 트리거가 막으면 Denied 로 바꿔 올립니다."""
        with self.connection() as conn:
            # 번호 매기기처럼 읽고 나서 쓰는 일이 끼어들지 않게 처음부터 쓰기 잠금을 잡습니다.
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
                conn.execute("COMMIT")
            except sqlite3.IntegrityError as exc:
                conn.execute("ROLLBACK")
                raise Denied(_readable(exc)) from None
            except BaseException:
                conn.execute("ROLLBACK")
                raise


def audit(conn: sqlite3.Connection, action: str, user_id: int | None = None, *, login_id: str | None = None,
          target_type: str | None = None, target_id: str | None = None, detail: str = "{}", ip: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_log (at, user_id, login_id, action, target_type, target_id, detail, ip) VALUES (?,?,?,?,?,?,?,?)",
        (now(), user_id, login_id, action, target_type, target_id, detail, ip),
    )
