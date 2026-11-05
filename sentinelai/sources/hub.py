"""데이터 계층의 입구 — 따로 선 모듈 넷(logs · snapshots · people/decisions · regulations)을 여기서만 모읍니다."""
from __future__ import annotations

from datetime import datetime
from functools import cached_property
from typing import Any

from ..db import Database, nodes, results
from . import decisions
from .logs import LoadResult, load_events
from .people import People
from .regulations import Regulations
from .snapshots import ServerSnapshot

SNAPSHOT_FIELDS = ("node", "host", "ip", "collected_at", "collected_by", "modules")


class Sources:
    """settings 의 events_source · DB 둘 · 엔진이 넘긴 RAG 저장소(documents)를 들고, 판정에 쓸 데이터를 종류별 구조체로 냅니다."""

    def __init__(self, settings: Any, main_db: Database, results_db: Database, documents: Any) -> None:
        self.settings = settings
        self.main_db = main_db
        self.results_db = results_db
        self.documents = documents

    # --- DLP 로그 ---

    def events(self, since: datetime | None = None) -> LoadResult:
        return load_events(self.settings.events_source, since=since)

    # --- 서버 상태 ---

    def pending_servers(self) -> list[dict[str, Any]]:
        """켜 둔 노드마다 아직 판정하지 않은 가장 늦은 수집 — 행 + snapshot(ServerSnapshot)."""
        rows = results.pending_snapshots(self.results_db, nodes.enabled_names(self.main_db))
        return [{**r, "snapshot": ServerSnapshot(**{k: r[k] for k in SNAPSHOT_FIELDS})} for r in rows]

    def server_decisions(self, node: str) -> list[dict[str, Any]]:
        return decisions.server(self.main_db, self.results_db, node)

    # --- DB 의 사용자 데이터 ---

    def people(self, events: list[Any] | None = None) -> People:
        """작업 한 번에 쓸 사람 자료 — 로그 · 계정 · 운영자 결정을 한 번만 읽습니다."""
        return People(self.main_db, self.results_db, self.events().records if events is None else events)

    def policy_decisions(self) -> list[dict[str, Any]]:
        return decisions.policy(self.main_db, self.results_db)

    # --- RAG 기준 문서 ---

    @cached_property
    def regulations(self) -> Regulations:
        return Regulations(self.documents)
