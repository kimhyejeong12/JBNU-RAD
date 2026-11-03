"""권한 DB(사용자 · 인증 · 권한 목록 · 신청 · AI 판정 · 결재 · 회수 · 정책 · 로그 결정)와 AI 결과 DB(정책 관리 검토 · 로그 감시 판정 · 질의 기록).

둘 다 PostgreSQL 한 DB 안의 스키마입니다 (main · results). 다른 DB 에 두려면 주소만 따로 주면 됩니다.
엔진 · 데이터 계층은 DB를 모릅니다. pipeline · web · CLI 만 씁니다.
설계와 결정 경위는 design/db-schema.md · design/results-db.md 에 있습니다.
"""
from __future__ import annotations

from . import auth, catalog, decisions, nodes, permissions, results
from .auth import User
from .core import Database, Denied


def open_main_db(url: str, schema: str = "main") -> Database:
    """권한 DB. 처음이면 스키마를 만듭니다."""
    db = Database(url, schema, "main.sql")
    db.init()
    return db


def open_results_db(url: str, schema: str = "results") -> Database:
    """AI 결과 DB. 처음이면 스키마를 만듭니다."""
    db = Database(url, schema, "results.sql")
    db.init()
    return db


__all__ = ["Database", "Denied", "User", "auth", "catalog", "decisions", "nodes", "open_main_db", "open_results_db", "permissions", "results"]
