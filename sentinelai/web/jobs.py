"""웹에서 코어 작업(pipeline)을 백그라운드로 돌립니다.

판정 한 번에 수 분이 걸리므로 요청 안에서 기다리지 않고, 화면은 /api/jobs 로 진행 상황을 봅니다.
모델은 한 번에 한 판정만 하므로 작업도 한 번에 하나만 돌립니다.
"""
from __future__ import annotations

import threading
from datetime import datetime
from typing import Any

from sentinelai import pipeline
from sentinelai.engine import Engine

KINDS = {"requests": "권한 신청 검토", "policies": "정책 관리 검토", "events": "로그 감시"}


class JobRunner:
    def __init__(self, engine: Engine, store: pipeline.ResultStore) -> None:
        self.engine = engine
        self.store = store
        self._lock = threading.Lock()
        self._status: dict[str, Any] = {"running": None, "done": 0, "total": 0, "started_at": None, "last": {}}

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {**self._status, "last": dict(self._status["last"])}

    def start(self, kind: str) -> bool:
        """작업을 시작합니다. 다른 작업이 돌고 있으면 False"""
        with self._lock:
            if self._status["running"]:
                return False
            self._status.update(running=kind, done=0, total=0, started_at=_now())
        threading.Thread(target=self._run, args=(kind,), daemon=True).start()
        return True

    def _progress(self, done: int, total: int, _item: dict[str, Any]) -> None:
        with self._lock:
            self._status.update(done=done, total=total)

    def _run(self, kind: str) -> None:
        error = None
        try:
            self._work(kind)
        except Exception as exc:  # 파일 없음 · 컬럼 없음 등은 화면에 그대로 보여줍니다.
            error = f"{type(exc).__name__}: {exc}"
        with self._lock:
            self._status["last"][kind] = {"finished_at": _now(), "error": error}
            self._status.update(running=None)

    def _work(self, kind: str) -> None:
        s = self.engine.settings
        if kind == "requests":
            self.store.put("requests", pipeline.review_requests(self.engine, s.requests_source, self._progress))
        elif kind == "policies":
            # 정책 파일이 바뀌었으면 RAG 의 규칙도 함께 맞춥니다. 로그 감시 · 질의응답이 이 규칙을 찾습니다.
            pipeline.index_policies(self.engine, s.policies_source)
            self.store.put("policies", pipeline.review_policies(self.engine, s.policies_source))
        else:
            since = self.store.last_event_at()
            self.store.add_events(pipeline.monitor(self.engine, s.events_source, since, progress=self._progress))


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")
