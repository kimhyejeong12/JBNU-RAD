from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .. import ROOT

HERE = Path(__file__).resolve().parent


class Denied(Exception):
    """규칙에 막힌 요청. 화면에 그대로 보여줄 수 있는 문장을 담습니다."""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    """SQLite 파일 하나. 요청마다 연결을 새로 열어 스레드 간에 연결을 나눠 쓰지 않습니다."""

    def __init__(self, path: str | Path, schema: str) -> None:
        path = Path(path)
        self.path = path if path.is_absolute() else ROOT / path
        self.schema = HERE / schema

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        return conn

    def init(self) -> None:
        """처음이면 스키마를 만듭니다. 이미 만들었으면 아무것도 하지 않습니다."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as conn:
            if conn.execute("PRAGMA user_version").fetchone()[0] == 0:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.executescript("BEGIN;" + self.schema.read_text(encoding="utf-8") + "PRAGMA user_version = 1; COMMIT;")

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
                raise Denied(str(exc)) from None
            except BaseException:
                conn.execute("ROLLBACK")
                raise


def audit(conn: sqlite3.Connection, action: str, user_id: int | None = None, *, login_id: str | None = None,
          target_type: str | None = None, target_id: str | None = None, detail: str = "{}", ip: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_log (at, user_id, login_id, action, target_type, target_id, detail, ip) VALUES (?,?,?,?,?,?,?,?)",
        (now(), user_id, login_id, action, target_type, target_id, detail, ip),
    )
