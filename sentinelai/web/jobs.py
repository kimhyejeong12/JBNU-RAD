"""웹에서 코어 작업(pipeline)을 백그라운드로 돌립니다.

판정 한 번에 수 분이 걸리므로 요청 안에서 기다리지 않고, 화면은 /api/jobs 로 진행 상황을 봅니다.
모델은 한 번에 한 판정만 하므로 작업도 한 번에 하나만 돌립니다.
로그 감시는 every() 로 정해진 간격마다 스스로 시작합니다. Milvus Lite 는 한 프로세스만 열 수 있어
웹이 떠 있는 동안에는 cron 의 `make monitor` 가 돌 수 없으므로 여기서 돌립니다.
"""
from __future__ import annotations

import threading
from datetime import datetime, timedelta
from typing import Any

from sentinelai import pipeline
from sentinelai.db import Database, results
from sentinelai.engine import Engine

KINDS = {"policies": "정책 관리 검토", "events": "로그 감시"}
# 화면에서 시작할 수 있는 작업. 로그 감시는 every() 로만 돕니다.
MANUAL = {"policies"}
# 자동 실행 차례에 다른 작업이 돌고 있으면 이만큼 뒤에 다시 시도합니다.
RETRY = timedelta(minutes=1)


class JobRunner:
    def __init__(self, engine: Engine, results_db: Database) -> None:
        self.engine = engine
        self.results_db = results_db
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._status: dict[str, Any] = {"running": None, "auto": False, "done": 0, "total": 0, "started_at": None, "last": {}}
        self._schedule: dict[str, dict[str, Any]] = {}

    def status(self) -> dict[str, Any]:
        """화면이 보는 작업 진행 상황."""
        with self._lock:
            return {**self._status, "last": dict(self._status["last"])}

    def schedule(self) -> dict[str, dict[str, Any]]:
        """자동 실행 예약 (간격 · 다음 시각). 작업 진행과 따로 두고, 나중에 상태 점검 API 가 읽습니다."""
        with self._lock:
            return {k: dict(v) for k, v in self._schedule.items()}

    def start(self, kind: str, auto: bool = False) -> bool:
        """작업을 시작합니다. 다른 작업이 돌고 있으면 False"""
        with self._lock:
            if self._status["running"]:
                return False
            self._status.update(running=kind, auto=auto, done=0, total=0, started_at=_now())
        threading.Thread(target=self._run, args=(kind, auto), daemon=True).start()
        return True

    def every(self, kind: str, minutes: int) -> None:
        """kind 작업을 minutes 분마다 자동으로 시작합니다 (0 이하면 끔). 첫 실행은 minutes 분 뒤입니다.

        웹을 다시 띄울 때마다(--reload) 곧바로 판정이 돌지 않게 바로 시작하지 않습니다.
        """
        if minutes > 0:
            threading.Thread(target=self._every, args=(kind, timedelta(minutes=minutes)), daemon=True).start()

    def stop(self) -> None:
        self._stop.set()

    def _every(self, kind: str, interval: timedelta) -> None:
        wait = interval
        while True:
            with self._lock:
                self._schedule[kind] = {"every_min": int(interval.total_seconds() // 60),
                                                  "next_at": (datetime.now() + wait).isoformat(timespec="seconds")}
            if self._stop.wait(wait.total_seconds()):
                return
            wait = interval if self.start(kind, auto=True) else RETRY

    def _progress(self, done: int, total: int, _item: dict[str, Any]) -> None:
        with self._lock:
            self._status.update(done=done, total=total)

    def _run(self, kind: str, auto: bool) -> None:
        error = None
        try:
            self._work(kind)
        except Exception as exc:  # 파일 없음 · 컬럼 없음 등은 화면에 그대로 보여줍니다.
            error = f"{type(exc).__name__}: {exc}"
        with self._lock:
            self._status["last"][kind] = {"finished_at": _now(), "error": error, "auto": auto}
            self._status.update(running=None, auto=False)

    def _work(self, kind: str) -> None:
        s = self.engine.settings
        if kind == "policies":
            # 기준 문서 · 정책 규칙을 RAG 에 맞추고(바뀐 것만) 정책 간 검토 · 서버 점검을 돌립니다.
            review = pipeline.review_policies(self.engine, s.policies_source, s.servers_source, progress=self._progress)
            results.save_policy_review(self.results_db, review, s.model)
        else:
            since = results.next_monitor_since(self.results_db)
            run = pipeline.monitor(self.engine, s.events_source, since, progress=self._progress)
            results.save_monitor_run(self.results_db, run, s.model, since.isoformat() if since else None)


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")
