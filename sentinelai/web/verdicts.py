"""권한 신청이 들어오면 바로 AI 판정을 돌립니다 (백그라운드, 한 번에 한 건).

판정 한 건에 수십 초가 걸리므로 신청 응답을 기다리게 하지 않습니다. 결과는 Log DB에 쌓이고 결재 화면이 읽어 갑니다.
"""
from __future__ import annotations

import logging
import queue
import threading

from sentinelai import pipeline
from sentinelai.db import Database, logs
from sentinelai.engine import Engine

log = logging.getLogger(__name__)


class VerdictWorker:
    def __init__(self, engine: Engine, main_db: Database, log_db: Database) -> None:
        self.engine, self.main_db, self.log_db = engine, main_db, log_db
        self._queue: queue.Queue[str] = queue.Queue()
        self._pending: set[str] = set()
        self._lock = threading.Lock()
        self._stopping = threading.Event()
        threading.Thread(target=self._run, daemon=True).start()

    def stop(self) -> None:
        """앱을 끌 때. 새 판정은 시작하지 않고, 돌던 판정은 결과를 남기지 않습니다 (다음 시작 때 다시 돕니다)."""
        self._stopping.set()
        self._queue.put("")

    def enqueue(self, request_no: str) -> None:
        with self._lock:
            if request_no in self._pending:
                return
            self._pending.add(request_no)
        self._queue.put(request_no)

    def pending(self, request_no: str) -> bool:
        with self._lock:
            return request_no in self._pending

    def resume(self) -> None:
        """결재 대기 중인데 판정이 없는 신청을 다시 줄 세웁니다 (웹을 다시 띄웠을 때)."""
        with self.main_db.connection() as conn:
            waiting = [r[0] for r in conn.execute("SELECT request_no FROM access_requests WHERE stage IN ('manager', 'top')")]
        for request_no in logs.unjudged(self.log_db, waiting):
            self.enqueue(request_no)

    def _run(self) -> None:
        while not self._stopping.is_set():
            request_no = self._queue.get()
            if self._stopping.is_set():
                return
            try:
                with self.main_db.connection() as conn:
                    row = conn.execute("SELECT * FROM access_requests WHERE request_no = ?", (request_no,)).fetchone()
                if row is not None:
                    result = pipeline.judge_request(self.engine, dict(row))
                    # 종료 중에 끝난 판정은 벡터 DB가 먼저 닫혀 실패했을 수 있어 남기지 않습니다.
                    if not self._stopping.is_set():
                        logs.save_request_verdict(self.log_db, request_no, result, self.engine.settings.model)
            except Exception:  # 한 건이 실패해도 다음 신청은 판정해야 합니다. LLM 실패는 judge_request 가 판정 실패로 남깁니다.
                log.exception("권한 신청 %s 판정을 저장하지 못했습니다", request_no)
            finally:
                with self._lock:
                    self._pending.discard(request_no)
