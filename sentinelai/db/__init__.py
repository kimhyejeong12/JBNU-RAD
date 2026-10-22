"""권한 DB(사용자 · 인증 · 권한 목록 · 신청 · AI 판정 · 결재 · 회수 · 정책 · 로그 결정)와 AI 결과 DB(정책 관리 검토 · 로그 감시 판정 · 질의 기록).

엔진 · 데이터 계층은 DB를 모릅니다. pipeline · web · CLI 만 씁니다.
설계와 결정 경위는 design/db-schema.md · design/results-db.md 에 있습니다.
"""
from __future__ import annotations

from . import auth, catalog, decisions, nodes, permissions, results
from .auth import User
from .core import Database, Denied


def open_main_db(path: str) -> Database:
    """권한 DB. 처음이면 스키마를 만듭니다."""
    db = Database(path, "schema.sql", "decisions.sql", "accounts.sql", "decisions_server.sql", "roles_names.sql", "nodes.sql", "nodes_keys.sql", "nodes_key_view.sql", "access_catalog.sql", "users_log_id.sql")
    db.init()
    with db.connection() as conn:
        columns = {r[1] for r in conn.execute("PRAGMA table_info(access_requests)")}
    if "ai_level" not in columns:
        raise RuntimeError(f"{db.path} 는 10/11 구조의 권한 DB입니다 (신청 1건 = 1행으로 바뀜). "
                           "옮길 데이터가 없으면 파일을 지우고 make create-root 로 다시 만드세요.")
    return db


def open_results_db(path: str) -> Database:
    """AI 결과 DB. 처음이면 스키마를 만듭니다."""
    db = Database(path, "results_schema.sql", "results_servers.sql", "results_server_gaps.sql", "results_server_snapshots.sql", "results_nodes.sql", "results_qa_servers.sql", "results_monitor_stage.sql")
    db.init()
    return db


__all__ = ["Database", "Denied", "User", "auth", "catalog", "decisions", "nodes", "open_main_db", "open_results_db", "permissions", "results"]
