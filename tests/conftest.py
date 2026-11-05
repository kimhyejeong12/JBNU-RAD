"""실제 PostgreSQL 시험 — SENTINELAI_TEST_DATABASE_URL 이 없으면 건너뛰고, 시험마다 새 스키마를 씁니다."""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import psycopg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sentinelai.db import User, auth, open_main_db, open_results_db  # noqa: E402

URL = os.environ.get("SENTINELAI_TEST_DATABASE_URL", "")
PASSWORD = "test-pass-1234"


@pytest.fixture
def url() -> str:
    if not URL:
        pytest.skip("SENTINELAI_TEST_DATABASE_URL 이 없습니다")
    return URL


@pytest.fixture
def schemas(url):
    tag = f"t_{uuid.uuid4().hex[:8]}"
    yield f"{tag}_main", f"{tag}_results"
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {tag}_main, {tag}_results CASCADE")


@pytest.fixture
def main_db(url, schemas):
    db = open_main_db(url, schemas[0])
    yield db
    db.close()


@pytest.fixture
def results_db(url, schemas):
    db = open_results_db(url, schemas[1])
    yield db
    db.close()


@pytest.fixture
def people(main_db) -> dict[str, User]:
    """루트 · 보안 총책임자 · 보안 운영자 · 일반 사용자 둘입니다."""
    root = auth.create_root(main_db, "root", PASSWORD, "루트", "보안팀")
    return {
        "root": root,
        "top": auth.create_user(main_db, root, "top", PASSWORD, "총책임자", "보안팀", "top"),
        "manager": auth.create_user(main_db, root, "manager", PASSWORD, "운영자", "보안팀", "manager"),
        "user": auth.create_user(main_db, root, "user", PASSWORD, "사용자", "인사팀", "user"),
        "user2": auth.create_user(main_db, root, "user2", PASSWORD, "사용자둘", "개발팀", "user"),
    }
