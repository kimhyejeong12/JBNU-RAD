"""권한 DB(사용자 · 인증 · 신청 · AI 판정 · 결재 · 회수 · 정책 · 로그 결정)와 AI 결과 DB(정책 관리 검토 · 로그 감시 판정 · 질의 기록).

엔진 · 데이터 계층은 DB를 모릅니다. pipeline · web · CLI 만 씁니다.
설계와 결정 경위는 design/db-schema.md · design/results-db.md 에 있습니다.
"""
from __future__ import annotations

from . import auth, decisions, permissions, results
from .auth import User
from .core import Database, Denied


def open_databases(db_path: str, results_db_path: str) -> tuple[Database, Database]:
    """(권한 DB, AI 결과 DB). 처음이면 스키마를 만듭니다."""
    main, results_db = Database(db_path, "schema.sql", "decisions.sql"), Database(results_db_path, "results_schema.sql")
    main.init()
    results_db.init()
    return main, results_db


__all__ = ["Database", "Denied", "User", "auth", "decisions", "open_databases", "permissions", "results"]
