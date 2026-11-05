from __future__ import annotations

import re
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.adapt import Dumper
from psycopg.conninfo import conninfo_to_dict
from psycopg_pool import ConnectionPool

HERE = Path(__file__).resolve().parent

# 제약 조건 위반은 PostgreSQL 원문이라 화면에 보일 문장으로 바꿉니다.
_CONSTRAINT_TEXT = {
    "users_login_id": "이미 있는 아이디입니다",
    "users_single_root": "루트 계정이 이미 있습니다",
    "users_log_id": "다른 계정이 이미 쓰는 로그 사용자 ID 입니다",
    "access_requests_request_no_key": "신청 번호가 겹쳤습니다. 다시 신청하세요",
}


def _readable(exc: psycopg.IntegrityError) -> str:
    if exc.diag.constraint_name in _CONSTRAINT_TEXT:
        return _CONSTRAINT_TEXT[exc.diag.constraint_name]
    if isinstance(exc, psycopg.errors.ForeignKeyViolation):
        return "없는 계정 · 신청을 가리킵니다"
    if isinstance(exc, psycopg.errors.CheckViolation):
        return "허용되지 않는 값입니다"
    return exc.diag.message_primary or str(exc)


class Denied(Exception):
    """규칙에 막힌 요청 — 문장은 화면에 그대로 보여줄 수 있습니다."""


class Row(dict):
    """이름(row["id"])과 순서(row[0]) 둘 다로 읽는 행입니다."""

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def _rows(cursor: psycopg.Cursor[Any]) -> Callable[[Sequence[Any]], Row]:
    names = [c.name for c in cursor.description or ()]
    return lambda values: Row(zip(names, values))


class _Flag(Dumper):
    """0/1 칸이 INTEGER 라 bool 을 1 · 0 으로 넣습니다."""

    oid = psycopg.postgres.types["int2"].oid

    def dump(self, obj: bool) -> bytes:
        return b"1" if obj else b"0"


def _configure(conn: psycopg.Connection[Any]) -> None:
    conn.adapters.register_dumper(bool, _Flag)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def today() -> str:
    # 날짜만 적는 칸은 사내 업무 기준인 서버 현지 날짜(KST)로 봅니다.
    return datetime.now().astimezone().strftime("%Y-%m-%d")


def describe(url: str) -> str:
    """비밀번호를 뺀 DB 위치입니다 (연결하지 않음)."""
    info = conninfo_to_dict(url)
    return f"postgresql://{info.get('host', 'localhost')}:{info.get('port', 5432)}/{info.get('dbname', '')}"


SCHEMA_NAME = re.compile(r"^[a-z_][a-z0-9_]*$")


class Database:
    """PostgreSQL 스키마 하나. 연결마다 search_path 를 두므로 쿼리에 스키마 이름을 쓰지 않습니다."""

    def __init__(self, url: str, schema: str, *schemas: str) -> None:
        if not SCHEMA_NAME.match(schema):
            raise ValueError(f"스키마 이름이 올바르지 않습니다: {schema}")
        self.url = url
        self.schema = schema
        self.schemas = [HERE / s for s in schemas]
        # 쓰기 트랜잭션은 이 키로 스키마마다 한 번에 하나씩 차례를 받습니다.
        self._lock = f"sentinelai.{schema}"
        self.pool = ConnectionPool(
            url, min_size=1, max_size=10, timeout=10, name=schema, open=True,
            kwargs={"autocommit": True, "row_factory": _rows, "options": f"-c search_path={schema} -c lock_timeout=10s"},
            configure=_configure, check=ConnectionPool.check_connection,
        )

    @property
    def label(self) -> str:
        return f"{describe(self.url)} (스키마 {self.schema})"

    def close(self) -> None:
        self.pool.close()

    def init(self) -> None:
        """아직 적용하지 않은 스키마 파일을 차례로 적용합니다 (schema_version = 적용한 파일 수)."""
        with self.connection() as conn, conn.transaction():
            # 동시에 처음 열어도 같은 파일을 두 번 적용하지 않게 차례를 받은 뒤 버전을 읽습니다.
            conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (self._lock,))
            conn.execute(f"CREATE SCHEMA IF NOT EXISTS {self.schema}")
            conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
            row = conn.execute("SELECT version FROM schema_version").fetchone()
            version = row["version"] if row else 0
            for schema in self.schemas[version:]:
                conn.execute(schema.read_text(encoding="utf-8"))
            if len(self.schemas) > version:
                conn.execute("DELETE FROM schema_version")
                conn.execute("INSERT INTO schema_version (version) VALUES (%s)", (len(self.schemas),))

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[Row]]:
        with self.pool.connection() as conn:
            yield conn

    @contextmanager
    def transaction(self) -> Iterator[psycopg.Connection[Row]]:
        """트리거 · 제약 조건이 막으면 Denied 로 바꿔 올립니다."""
        with self.connection() as conn:
            try:
                with conn.transaction():
                    # 읽고 나서 쓰는 일(번호 매기기 등)이 끼어들지 않게 처음부터 차례를 받습니다.
                    conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (self._lock,))
                    yield conn
            except psycopg.errors.RaiseException as exc:
                raise Denied(exc.diag.message_primary or str(exc)) from None
            except psycopg.IntegrityError as exc:
                raise Denied(_readable(exc)) from None


def audit(conn: psycopg.Connection[Row], action: str, user_id: int | None = None, *, login_id: str | None = None,
          target_type: str | None = None, target_id: str | None = None, detail: str = "{}", ip: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_log (at, user_id, login_id, action, target_type, target_id, detail, ip) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (now(), user_id, login_id, action, target_type, target_id, detail, ip),
    )
