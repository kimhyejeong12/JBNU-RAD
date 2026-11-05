"""통합 잡 큐 — 일꾼 하나가 모든 AI 일을 우선순위대로 하나씩 돌립니다 (모델 · 벡터 DB 를 동시에 치지 않게)."""
from __future__ import annotations

import itertools
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

log = logging.getLogger(__name__)

# 작은 수가 먼저입니다. 긴 일은 진행 보고 때마다 더 급한 일에 자리를 내줍니다.
URGENT, FAST, NORMAL = 0, 1, 2


class JobCancelled(Exception):
    """cancel() · reset() 으로 끝낸 일 — 결과를 남기지 않습니다."""


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


@dataclass
class Job:
    kind: str
    key: str
    work: Callable[[Callable[..., None]], Any]
    priority: int = NORMAL
    auto: bool = False
    id: int = 0
    status: str = "waiting"  # waiting · running · done · failed · cancelled
    done: int = 0
    total: int = 0
    error: str | None = None
    result: Any = None
    created_at: str = field(default_factory=_now)
    started_at: str | None = None
    finished_at: str | None = None
    finished: threading.Event = field(default_factory=threading.Event, repr=False)

    def wait(self, timeout: float | None = None) -> bool:
        return self.finished.wait(timeout)

    def brief(self) -> dict[str, Any]:
        return {"id": self.id, "kind": self.kind, "key": self.key, "status": self.status, "auto": self.auto, "done": self.done,
                "total": self.total, "created_at": self.created_at, "started_at": self.started_at}


class JobQueue:
    def __init__(self) -> None:
        self._cond = threading.Condition()
        self._ids = itertools.count(1)
        self._waiting: list[Job] = []
        # 바깥 일부터 — 긴 일이 진행 보고 때 급한 일을 안에서 돌리면 쌓입니다.
        self._running: list[Job] = []
        self._last: dict[str, dict[str, Any]] = {}
        self._schedule: dict[str, dict[str, Any]] = {}
        self._stopping = False
        # reset() 이 일꾼을 새로 띄우면 응답 없는 모델 호출에 묶인 옛 일꾼은 돌아와도 아무것도 하지 않고 끝납니다.
        self._worker = 0
        self._spawn()
        threading.Thread(target=self._scheduler, daemon=True, name="jobs-schedule").start()

    # --- 넣기 · 보기 ---

    def submit(self, kind: str, work: Callable[[Callable[..., None]], Any], key: str | None = None, priority: int = NORMAL,
               auto: bool = False) -> tuple[Job, bool]:
        """같은 key 가 기다리거나 돌고 있으면 그 일을 돌려줍니다. → (일, 새로 넣었는지)"""
        key = key or kind
        with self._cond:
            same = self._find(key)
            if same:
                return same, False
            job = Job(kind, key, work, priority, auto, id=next(self._ids))
            self._waiting.append(job)
            self._cond.notify_all()
            return job, True

    def pending(self, key: str) -> bool:
        with self._cond:
            return self._find(key) is not None

    def running(self) -> list[Job]:
        with self._cond:
            return list(self._running)

    def waiting(self) -> list[Job]:
        with self._cond:
            return sorted(self._waiting, key=self._order)

    def last(self) -> dict[str, dict[str, Any]]:
        with self._cond:
            return {k: dict(v) for k, v in self._last.items()}

    def schedule(self) -> dict[str, dict[str, Any]]:
        with self._cond:
            return {k: {"every_min": v["every_min"], "next_at": v["next_at"].isoformat(timespec="seconds")} for k, v in self._schedule.items()}

    def _find(self, key: str) -> Job | None:
        return next((j for j in [*self._running, *self._waiting] if j.key == key), None)

    @staticmethod
    def _order(job: Job) -> tuple[int, int]:
        return job.priority, job.id

    # --- 끝내기 ---

    def cancel(self, key: str, waiting_only: bool = False) -> Job | None:
        """기다리던 일은 바로 빼고, 돌던 일은 다음 진행 보고 때 멈춥니다 (waiting_only 면 돌던 일은 그대로)."""
        with self._cond:
            job = self._find(key)
            if job is None or (waiting_only and job not in self._waiting):
                return None
            if job in self._waiting:
                self._waiting.remove(job)
                self._close(job, "cancelled", "취소했습니다")
            else:
                job.status = "cancelled"
            return job

    def reset(self) -> list[Job]:
        """돌던 일을 모두 끝내고 일꾼을 새로 띄웁니다. → 끝낸 일 (바깥부터)"""
        with self._cond:
            stopped = list(self._running)
            for job in stopped:
                self._close(job, "cancelled", "강제로 끝냈습니다")
            self._running.clear()
            if stopped:
                self._spawn()
            return stopped

    def stop(self, timeout: float = 5.0) -> None:
        """돌던 일이 끝나기를 잠깐 기다립니다. 결과는 남기지 않습니다."""
        with self._cond:
            self._stopping = True
            for job in self._running:
                job.status = "cancelled"
            self._cond.notify_all()
            waited = self._cond.wait_for(lambda: not self._running, timeout)
        if not waited:
            log.warning("돌던 작업이 %s초 안에 끝나지 않아 기다리지 않고 멈춥니다", timeout)

    # --- 예약 ---

    def every(self, kind: str, minutes: int, make: Callable[[], tuple[Callable[[Callable[..., None]], Any], int]]) -> None:
        """지금 한 번, 그 뒤 minutes 분마다 넣습니다 (0 이하면 끔). 이미 기다리거나 돌고 있으면 그 차례는 건너뜁니다."""
        if minutes <= 0:
            return
        with self._cond:
            self._schedule[kind] = {"every_min": minutes, "next_at": datetime.now(), "make": make}
            self._cond.notify_all()

    def _scheduler(self) -> None:
        with self._cond:
            while not self._stopping:
                now = datetime.now()
                for kind, s in self._schedule.items():
                    if s["next_at"] <= now:
                        s["next_at"] = now + timedelta(minutes=s["every_min"])
                        if self._find(kind) is None:
                            work, priority = s["make"]()
                            self._waiting.append(Job(kind, kind, work, priority, auto=True, id=next(self._ids)))
                            self._cond.notify_all()
                due = min((s["next_at"] for s in self._schedule.values()), default=now + timedelta(minutes=1))
                self._cond.wait(max(0.1, min((due - now).total_seconds(), 60)))

    # --- 돌리기 ---

    def _spawn(self) -> None:
        self._worker += 1
        threading.Thread(target=self._work, args=(self._worker,), daemon=True, name=f"jobs-{self._worker}").start()

    def _next(self, below: int | None = None) -> Job | None:
        """below 가 있으면 그보다 급한 일만."""
        ready = [j for j in self._waiting if below is None or j.priority < below]
        if not ready:
            return None
        job = min(ready, key=self._order)
        self._waiting.remove(job)
        return job

    def _work(self, worker: int) -> None:
        while True:
            with self._cond:
                self._cond.wait_for(lambda: self._stopping or worker != self._worker or self._waiting)
                if self._stopping or worker != self._worker:
                    return
                job = self._next()
            self._run(job, worker)

    def _run(self, job: Job, worker: int) -> None:
        with self._cond:
            if worker != self._worker:
                return
            job.status, job.started_at = "running", _now()
            self._running.append(job)
        status, error, result = "done", None, None
        try:
            result = job.work(lambda done=0, total=0, *_: self._progress(job, worker, done, total))
        except JobCancelled:
            status, error = "cancelled", "강제로 끝냈습니다"
        except Exception as exc:  # 파일 없음 · 컬럼 없음 등은 화면에 그대로 보여줍니다.
            log.exception("작업 %s 이 실패했습니다", job.key)
            status, error = "failed", f"{type(exc).__name__}: {exc}"
        with self._cond:
            if worker != self._worker or job not in self._running:
                return
            self._running.remove(job)
            if job.status == "cancelled":
                status, error = "cancelled", error or "강제로 끝냈습니다"
            job.result = result
            self._close(job, status, error)
            self._cond.notify_all()

    def _progress(self, job: Job, worker: int, done: int, total: int) -> None:
        """멈출 일이면 JobCancelled. 아니면 기다리는 더 급한 일을 이 자리에서 돌립니다."""
        while True:
            with self._cond:
                if job.status == "cancelled" or worker != self._worker or self._stopping:
                    raise JobCancelled
                job.done, job.total = done, total
                urgent = self._next(below=job.priority)
            if urgent is None:
                return
            self._run(urgent, worker)

    def _close(self, job: Job, status: str, error: str | None) -> None:
        job.status, job.error, job.finished_at = status, error, _now()
        self._last[job.kind] = {"finished_at": job.finished_at, "error": error if status != "done" else None, "auto": job.auto}
        job.finished.set()
