"""권한 DB(사용자 · 인증 · 신청 · 결재 · 회수)와 Log DB(AI 판정).

엔진 · 데이터 계층은 DB를 모릅니다. pipeline · web · CLI 만 씁니다.
설계와 결정 경위는 design/db-schema.md 에 있습니다.
"""
from __future__ import annotations

from . import auth, logs, permissions
from .auth import User
from .core import Database, Denied


def open_databases(db_path: str, log_db_path: str) -> tuple[Database, Database]:
    """(권한 DB, Log DB). 처음이면 스키마를 만듭니다."""
    main, log = Database(db_path, "schema.sql"), Database(log_db_path, "log_schema.sql")
    main.init()
    log.init()
    return main, log


__all__ = ["Database", "Denied", "User", "auth", "logs", "open_databases", "permissions"]
