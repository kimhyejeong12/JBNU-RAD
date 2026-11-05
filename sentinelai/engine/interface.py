"""엔진 입구 — 자원 · 큐 · 이슈어 · 워커를 엮고, 웹 · CLI 가 부르는 이름만 둡니다."""
from __future__ import annotations

import itertools
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from ..db import Database, User
from ..sources import Collected
from .issue import Issuer
from .queue import FAST, IDLE, KINDS, MANUAL, NORMAL, Batch, Job, Progress, Queues
from .rag import DocumentStore, IndexReport
from .resource import Resources
from .settings import Settings
from .worker import Worker

log = logging.getLogger(__name__)

# 질의(정책 · 로그 · 서버)는 질의 통합 시스템으로 다시 만드는 중이라 자리만 남겨 둡니다.
ASK_PAUSED = "질의 기능을 다시 만드는 중입니다"


class Engine:
    """웹은 start() 로 이슈어 예약 · 워커 스레드를 켜고, CLI 는 run_* 로 그 자리에서 돌립니다."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.res = Resources(settings)
        self.settings = self.res.settings
        self.queues = Queues()
        self.issuer = Issuer(self.res, self.queues)
        self.worker = Worker(self.res, self.queues)
        self._started = False
        self._index = itertools.count(1)

    @property
    def documents(self) -> DocumentStore:
        return self.res.documents

    @property
    def main_db(self) -> Database:
        return self.res.main_db

    @property
    def results_db(self) -> Database:
        return self.res.results_db

    @property
    def queue(self) -> Queues:
        return self.queues

    def health(self) -> dict[str, Any]:
        return self.res.health()

    # --- 웹: 예약 · 워커 ---

    def start(self) -> None:
        """기준 문서 적재 · 판정 못한 신청 · 재검토를 먼저 쌓고, 자동 작업은 뜨자마자 한 번 그 뒤 정한 간격마다 돕니다."""
        self.exclusive(self._reindex)
        self.issuer.resume()
        for kind in ("events", "nodes", "suspects"):
            self.issuer.every(kind, self.settings.monitor_interval_min)
        self.issuer.every("events_fast", self.settings.fast_interval_min)
        self.worker.start()
        self.issuer.start()
        self._started = True

    def stop(self) -> None:
        """돌던 잡을 5초 기다리고(결과는 버림) 벡터 DB 잠금을 풉니다."""
        self.issuer.stop()
        self.queues.stop()
        self.queues.wait_idle(5)
        self.res.close()

    def start_job(self, kind: str) -> bool:
        """같은 작업이 기다리거나 돌고 있으면 False"""
        return self.issuer.issue(kind) is not None

    def pending(self, key: str) -> bool:
        """신청 번호 또는 grant:신청번호:이동 id 의 판정을 기다리거나 하는 중인지."""
        return self.queues.pending(key)

    def enqueue_request(self, request_no: str) -> None:
        self.issuer.request(request_no)

    def enqueue_grants(self, user_id: int | None = None) -> None:
        self.issuer.grants(user_id)

    def exclusive(self, work: Any) -> Job:
        return self.issuer.exclusive(f"index:{next(self._index)}", work)

    def reset_jobs(self, rerun: bool = False) -> list[str]:
        """돌던 잡과 그 묶음을 강제로 끝내고 새 워커를 띄웁니다. rerun 이면 같은 작업을 다시 쌓습니다. → 끝낸 작업의 종류"""
        stopped = self.queues.reset()
        if stopped:
            self.worker.start()
        for unit in stopped if rerun else []:
            if isinstance(unit, Batch):
                self.issuer.issue(unit.kind, auto=unit.auto)
            elif unit.kind == "request":
                self.issuer.request(unit.key)
            elif unit.kind == "grant":
                self.issuer.grants()
            else:
                self.queues.submit(Job(unit.kind, unit.key, work=unit.work))
        return [unit.kind for unit in stopped]

    def clear_queue(self) -> list[str]:
        """기다리던 잡까지 모두 끝내고 새 워커를 띄운 뒤, 뜰 때처럼 기준 문서 적재 · 판정 못한 신청을 다시 쌓습니다. 예약은 그대로. → 끝낸 작업의 종류"""
        stopped = self.queues.clear()
        if self._started:
            self.worker.start()
            self.exclusive(self._reindex)
            self.issuer.resume()
        return [unit.kind for unit in stopped]

    def queue_detail(self) -> dict[str, Any]:
        """설정 화면 — 화면용 상태 · 예약 · 판정 대기열에 길마다 기다리는 잡 전부를 더합니다."""
        return {**self.status(), **self.queues.detail()}

    def job_status(self) -> dict[str, Any]:
        return self.queues.job_status(self.issuer.schedule()) if self._started else dict(IDLE)

    def status(self) -> dict[str, Any]:
        if not self._started:
            return {"jobs": {**IDLE, "kinds": KINDS}, "schedule": {}, "verdicts": {}}
        return self.queues.status(self.issuer.schedule())

    # --- CLI: 묶음을 쌓고 이 자리에서 돌림 (웹이 꺼져 있을 때) ---

    def _run(self, kind: str, progress: Progress | None, **options: Any) -> Any:
        batch = self.issuer.issue(kind, progress=progress, **options)
        if batch is None:
            raise RuntimeError(f"{KINDS[kind]}이 이미 쌓여 있습니다")
        self.worker.drain()
        if batch.status == "failed":
            raise RuntimeError(batch.error)
        return batch.result

    def index(self, source: str | Path | None = None, rebuild: bool = False) -> IndexReport:
        return self.worker.index(source, rebuild)

    def _reindex(self) -> IndexReport:
        """뜰 때마다 docs/ 를 RAG 에 맞춥니다 — 바뀐 파일만 임베딩해 그대로면 금방 끝납니다."""
        report = self.worker.index()
        log.info("기준 문서 적재 — %s", report)
        return report

    def remove_document(self, name: str) -> bool:
        """RAG 에서만 뺍니다. docs/ 의 파일은 부르는 쪽이 지웁니다."""
        return self.res.documents.remove(name)

    def run_policies(self, progress: Progress | None = None) -> dict[str, Any]:
        return self._run("policies", progress)

    def run_nodes(self, progress: Progress | None = None) -> dict[str, Any]:
        return self._run("nodes", progress)

    def run_events(self, since: datetime | None = None, until: datetime | None = None, full: bool = False,
                   progress: Progress | None = None, stage: str = "final") -> dict[str, Any]:
        return self._run("events_fast" if stage == "fast" else "events", progress, since=since, until=until, full=full)

    def run_suspects(self, progress: Progress | None = None) -> dict[str, Any]:
        return self._run("suspects", progress)

    # --- 수집 받기 · 집계 (이슈어) ---

    def receive_snapshot(self, presented: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self.issuer.receive_snapshot(presented, payload)

    def import_snapshots(self, folder: str | Path, node: str | None = None) -> tuple[Collected, int]:
        return self.issuer.import_snapshots(folder, node)

    def stats(self, period: str) -> dict[str, Any]:
        return self.issuer.stats(period)

    def user_stats(self, period: str) -> dict[str, Any]:
        return self.issuer.user_stats(period)

    def browse_logs(self, user: User, period: str, who: str = "", solution: str = "", how: str = "", page: int = 1,
                    ip: str | None = None) -> dict[str, Any]:
        return self.issuer.browse_logs(user, period, who, solution, how, page, ip)

    # --- 질의 (자리만) ---

    def ask(self, question: str, user: User) -> dict[str, Any]:
        return {"answer": ASK_PAUSED, "sources": [], "elapsed_sec": 0.0, "failed": True, "error": ASK_PAUSED}

    def _paused(self, question: str) -> dict[str, Any]:
        return {"question": question, "criteria": {}, "facts": None, "evidence": [], "answer": ASK_PAUSED, "sources": [],
                "failed": True, "error": ASK_PAUSED, "elapsed_sec": 0.0}

    def ask_logs(self, question: str, user: User) -> dict[str, Any]:
        return self._paused(question)

    def ask_servers(self, question: str, user: User) -> dict[str, Any]:
        return self._paused(question)


__all__ = ["FAST", "KINDS", "MANUAL", "NORMAL", "Engine"]
