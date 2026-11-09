"""권한 DB(main)와 AI 결과 DB(results) — 둘 다 PostgreSQL 스키마이고 엔진 · 데이터 계층은 모릅니다."""
from __future__ import annotations

import atexit
import threading

from . import auth, catalog, decisions, lookup, nodes, permissions, regulations, results
from .auth import User
from .core import Database, Denied

# 여러 스레드가 동시에 처음 열어도 주소 · 스키마마다 연결 풀이 하나이게 합니다.
_opened: dict[tuple[str, str], Database] = {}
_lock = threading.Lock()


def _open(url: str, schema: str, *files: str) -> Database:
    with _lock:
        db = _opened.get((url, schema))
        if db is None or db.pool.closed:
            db = Database(url, schema, *files)
            db.init()
            _opened[(url, schema)] = db
        return db


@atexit.register
def _close_all() -> None:
    """닫지 않고 끝나면 풀 스레드가 경고를 남깁니다."""
    with _lock:
        for db in _opened.values():
            db.close()
        _opened.clear()


def open_main_db(url: str, schema: str = "main") -> Database:
    """처음이면 스키마를 만듭니다."""
    return _open(url, schema, "main.sql", "main_email.sql", "main_regulations.sql", "main_grounding.sql")


def open_results_db(url: str, schema: str = "results") -> Database:
    """처음이면 스키마를 만듭니다."""
    return _open(url, schema, "results.sql", "results_ask.sql", "results_ask_stages.sql", "results_grounding.sql")


__all__ = ["Database", "Denied", "User", "auth", "catalog", "decisions", "lookup", "nodes", "open_main_db", "open_results_db", "permissions", "regulations", "results"]
