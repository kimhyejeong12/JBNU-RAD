"""권한 DB(사용자 · 인증 · 권한 목록 · 신청 · AI 판정 · 결재 · 회수 · 정책 · 로그 결정)와 AI 결과 DB(정책 관리 검토 · 로그 감시 판정 · 질의 기록).

둘 다 PostgreSQL 스키마입니다 (main · results). 주소는 SQLite 때 이름 그대로인 SENTINELAI_DB_PATH · SENTINELAI_RESULTS_DB_PATH 에 둡니다.
엔진 · 데이터 계층은 DB를 모릅니다. pipeline · web · CLI 만 씁니다.
설계와 결정 경위는 design/db-schema.md · design/results-db.md 에 있습니다.
"""
from __future__ import annotations

import atexit
import threading

from . import auth, catalog, decisions, nodes, permissions, results
from .auth import User
from .core import Database, Denied

# 같은 주소 · 스키마는 한 번만 엽니다. 웹이 뜰 때 큐 · 자동 실행 스레드가 동시에 처음 열어도 연결 풀이 하나뿐입니다.
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
    """프로세스가 끝날 때 연결 풀을 닫습니다. 연결을 끊지 않고 끝나면 풀 스레드가 경고를 남깁니다."""
    with _lock:
        for db in _opened.values():
            db.close()
        _opened.clear()


def open_main_db(url: str, schema: str = "main") -> Database:
    """권한 DB. 처음이면 스키마를 만듭니다."""
    return _open(url, schema, "main.sql")


def open_results_db(url: str, schema: str = "results") -> Database:
    """AI 결과 DB. 처음이면 스키마를 만듭니다."""
    return _open(url, schema, "results.sql")


__all__ = ["Database", "Denied", "User", "auth", "catalog", "decisions", "nodes", "open_main_db", "open_results_db", "permissions", "results"]
