"""종류별 큐 — 잡은 판정 한 건, 여러 건을 한 번에 돌리는 실행은 묶음(Batch). 워커 하나가 길 순서 · 들어온 순서로 꺼냅니다."""
from __future__ import annotations

import itertools
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

# 길 — 작은 수가 먼저입니다. 같은 길은 먼저 들어온 것부터.
URGENT, FAST, NORMAL = 0, 1, 2
LANES = {"request": URGENT, "grant": URGENT, "events_fast": FAST, "index": FAST,
         "events": NORMAL, "nodes": NORMAL, "suspects": NORMAL, "policies": NORMAL}
KINDS = {"policies": "정책 관리 검토", "events": "로그 감시", "nodes": "서버 점검", "events_fast": "빠른 로그 감시", "suspects": "위협 예측"}
# 화면에서 시작할 수 있는 작업입니다. 로그 감시는 서버가 스스로만 돌립니다.
MANUAL = {"policies", "nodes", "suspects"}
VERDICTS = {"request", "grant"}
# 화면의 작업 막대에 보이는 작업입니다. 빠른 감시는 fast 칸에 따로 둡니다.
MAIN = set(KINDS) - {"events_fast"}
STOPPED = "강제로 끝냈습니다"

Progress = Callable[[int, int, dict[str, Any]], None]


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


@dataclass(eq=False)
class Batch:
    """한 번의 실행 — 잡 여럿과 마지막 닫기 잡. context 는 이슈어가 넘긴 실행 정보, items 는 끝낸 잡의 결과."""

    kind: str
    auto: bool = False
    id: int = 0
    status: str = "waiting"  # waiting · running · done · failed · cancelled
    total: int = 0
    done: int = 0
    context: dict[str, Any] = field(default_factory=dict)
    items: list[dict[str, Any]] = field(default_factory=list)
    progress: Progress | None = None
    result: Any = None
    error: str | None = None
    created_at: str = field(default_factory=_now)
    started_at: str | None = None
    finished_at: str | None = None
    finished: threading.Event = field(default_factory=threading.Event, repr=False)

    @property
    def key(self) -> str:
        return self.kind

    def brief(self) -> dict[str, Any]:
        return {"id": self.id, "kind": self.kind, "key": self.key, "status": self.status, "auto": self.auto, "done": self.done,
                "total": self.total, "created_at": self.created_at, "started_at": self.started_at}


@dataclass(eq=False)
class Job:
    """판정 한 건(data) · 묶음 닫기(close) · 그 밖의 일(work, 기준 문서 적재) 중 하나."""

    kind: str
    key: str
    data: Any = None
    batch: Batch | None = None
    close: bool = False
    work: Callable[[], Any] | None = None
    auto: bool = False
    id: int = 0
    status: str = "waiting"
    error: str | None = None
    result: Any = None
    created_at: str = field(default_factory=_now)
    started_at: str | None = None
    finished_at: str | None = None
    finished: threading.Event = field(default_factory=threading.Event, repr=False)

    @property
    def priority(self) -> int:
        return LANES[self.kind]

    def wait(self, timeout: float | None = None) -> bool:
        return self.finished.wait(timeout)

    def brief(self) -> dict[str, Any]:
        return {"id": self.id, "kind": self.kind, "key": self.key, "status": self.status, "auto": self.auto, "done": 0,
                "total": 0, "created_at": self.created_at, "started_at": self.started_at}


class Queues:
    def __init__(self) -> None:
        self.cond = threading.Condition()
        self._ids = itertools.count(1)
        self._lanes: dict[int, list[Job]] = {lane: [] for lane in sorted(set(LANES.values()))}
        self._running: Job | None = None
        self._batches: list[Batch] = []
        self._last: dict[str, dict[str, Any]] = {}
        self.stopping = False
        # reset() 때 올립니다. 응답 없는 모델 호출에 묶였던 옛 워커는 돌아와도 아무것도 쓰지 않습니다.
        self.generation = 0

    # --- 넣기 ---

    def _put(self, job: Job) -> None:
        job.id = next(self._ids)
        self._lanes[job.priority].append(job)

    def submit(self, job: Job) -> tuple[Job, bool]:
        """같은 key 가 기다리거나 돌고 있으면 그 잡을 돌려줍니다. → (잡, 새로 넣었는지)"""
        with self.cond:
            same = self._find(job.key)
            if same is not None:
                return same, False
            self._put(job)
            self.cond.notify_all()
            return job, True

    def open(self, kind: str, auto: bool = False, progress: Progress | None = None) -> Batch | None:
        """같은 종류의 묶음이 열려 있으면 None."""
        with self.cond:
            if any(b.kind == kind for b in self._batches):
                return None
            batch = Batch(kind, auto, id=next(self._ids), progress=progress)
            self._batches.append(batch)
            return batch

    def fill(self, batch: Batch, items: list[tuple[str, Any]], **context: Any) -> None:
        """items = (key, data) 들. 맨 끝에 닫기 잡을 붙여 그 묶음의 잡이 모두 끝난 뒤 돌게 합니다."""
        with self.cond:
            batch.context.update(context)
            batch.total = len(items)
            for key, data in items:
                self._put(Job(batch.kind, key, data, batch=batch, auto=batch.auto))
            self._put(Job(batch.kind, f"{batch.kind}:close", batch=batch, close=True, auto=batch.auto))
            self.cond.notify_all()

    def discard(self, batch: Batch, error: str) -> None:
        """이슈어가 데이터를 못 읽어 채우지 못한 묶음을 닫습니다."""
        with self.cond:
            self._close_batch(batch, "failed", error)

    # --- 꺼내기 · 끝내기 (워커만) ---

    def take(self, generation: int, block: bool = True) -> Job | None:
        """길 순서 · 들어온 순서로 하나. 멈추거나 세대가 바뀌면(또는 block=False 인데 비면) None."""
        with self.cond:
            while True:
                if self.stopping or generation != self.generation:
                    return None
                job = next((lane[0] for lane in self._lanes.values() if lane), None)
                if job is not None:
                    self._lanes[job.priority].remove(job)
                    job.status, job.started_at = "running", _now()
                    if job.batch is not None and job.batch.status == "waiting":
                        job.batch.status, job.batch.started_at = "running", job.started_at
                    self._running = job
                    return job
                if not block:
                    return None
                self.cond.wait()

    def live(self, job: Job, generation: int) -> bool:
        """결과를 써도 되는지 — 취소 · 강제 중지 · 종료면 False."""
        with self.cond:
            return (not self.stopping and generation == self.generation and job.status == "running"
                    and (job.batch is None or job.batch.status == "running"))

    def finish(self, job: Job, generation: int, status: str, error: str | None, result: Any) -> None:
        with self.cond:
            if generation != self.generation or self._running is not job:
                return
            self._running = None
            job.status, job.error, job.result, job.finished_at = status, error, result, _now()
            batch = job.batch
            if batch is None:
                self._remember(job.kind, job.finished_at, error if status != "done" else None, job.auto)
            elif job.close:
                batch.result = result
                self._close_batch(batch, status, error)
            elif status == "done":
                batch.items.append(result)
                batch.done += 1
            job.finished.set()
            self.cond.notify_all()
        if batch is not None and not job.close and status == "done" and batch.progress:
            batch.progress(batch.done, batch.total, result)

    def _close_batch(self, batch: Batch, status: str, error: str | None) -> None:
        batch.status, batch.error, batch.finished_at = status, error, _now()
        if batch in self._batches:
            self._batches.remove(batch)
        for lane in self._lanes.values():
            lane[:] = [j for j in lane if j.batch is not batch]
        self._remember(batch.kind, batch.finished_at, error if status != "done" else None, batch.auto)
        batch.finished.set()

    def _remember(self, kind: str, at: str, error: str | None, auto: bool) -> None:
        self._last[kind] = {"finished_at": at, "error": error, "auto": auto}

    def record(self, kind: str, error: str | None, auto: bool) -> None:
        """잡 없이 끝난 실행(이슈어 실패 등)을 last 에 적습니다."""
        with self.cond:
            self._remember(kind, _now(), error, auto)

    # --- 취소 · 강제 중지 · 멈춤 ---

    def cancel(self, key: str, waiting_only: bool = False) -> Job | None:
        """기다리던 잡은 바로 빼고, 돌던 잡은 결과를 버리게 합니다 (waiting_only 면 돌던 잡은 그대로)."""
        with self.cond:
            job = self._find(key)
            if job is None or (waiting_only and job is self._running):
                return None
            if job is self._running:
                job.status = "cancelled"
            else:
                self._lanes[job.priority].remove(job)
                job.status, job.error, job.finished_at = "cancelled", "취소했습니다", _now()
                job.finished.set()
            return job

    def reset(self) -> list[Batch | Job]:
        """돌던 잡과 그 묶음을 끝내고 세대를 올립니다. → 끝낸 묶음 또는 단독 잡"""
        with self.cond:
            job = self._running
            if job is None:
                return []
            self._running = None
            self.generation += 1
            job.status, job.error, job.finished_at = "cancelled", STOPPED, _now()
            job.finished.set()
            if job.batch is not None:
                self._close_batch(job.batch, "cancelled", STOPPED)
                stopped: Batch | Job = job.batch
            else:
                self._remember(job.kind, job.finished_at, STOPPED, job.auto)
                stopped = job
            self.cond.notify_all()
            return [stopped]

    def stop(self) -> None:
        with self.cond:
            self.stopping = True
            if self._running is not None:
                self._running.status = "cancelled"
            self.cond.notify_all()

    def wait_idle(self, timeout: float) -> bool:
        with self.cond:
            return self.cond.wait_for(lambda: self._running is None, timeout)

    # --- 보기 ---

    def _waiting(self) -> list[Job]:
        return [j for lane in self._lanes.values() for j in lane]

    def _find(self, key: str) -> Job | None:
        return next((j for j in [*([self._running] if self._running else []), *self._waiting()] if j.key == key), None)

    def pending(self, key: str) -> bool:
        """그 key 의 잡 또는 그 종류의 묶음이 기다리거나 도는 중인지."""
        with self.cond:
            return self._find(key) is not None or any(b.key == key for b in self._batches)

    def last(self) -> dict[str, dict[str, Any]]:
        with self.cond:
            return {k: dict(v) for k, v in self._last.items()}

    def job_status(self, schedule: dict[str, dict[str, Any]]) -> dict[str, Any]:
        """화면용 — running 은 도는 묶음(없으면 기다리는 첫 작업, queued), 빠른 로그 감시는 fast 에 따로 둡니다."""
        with self.cond:
            units = [*self._batches, *(j for j in self._waiting() if j.batch is None)]
            main = next((b for b in self._batches if b.kind in MAIN and b.status == "running"), None)
            shown = main or next((u for u in units if u.kind in MAIN), None)
            out = {"running": shown.kind if shown else None, "auto": shown.auto if shown else False,
                   "done": main.done if main else 0, "total": main.total if main else 0, "started_at": main.started_at if main else None,
                   "queued": main is None and shown is not None,
                   "last": {k: dict(v) for k, v in self._last.items() if k in MAIN},
                   "waiting": [u.brief() for u in units if u.status == "waiting" and u.kind != "events_fast"]}
            if "events_fast" in schedule:
                fast = next((b for b in self._batches if b.kind == "events_fast" and b.status == "running"), None)
                out["fast"] = {"running": fast.kind if fast else None, "auto": True, "done": fast.done if fast else 0,
                               "total": fast.total if fast else 0, "started_at": fast.started_at if fast else None,
                               "last": {k: dict(v) for k, v in self._last.items() if k == "events_fast"}, **schedule["events_fast"]}
            return out

    def status(self, schedule: dict[str, dict[str, Any]]) -> dict[str, Any]:
        """작업 큐 · 자동 실행 예약 · 권한 신청 판정 대기열 (/internal/status)."""
        jobs = {**self.job_status(schedule), "kinds": KINDS}
        with self.cond:
            current = self._running.key if self._running and self._running.kind in VERDICTS else None
            waiting = sorted(j.key for j in self._waiting() if j.kind in VERDICTS)
        return {"jobs": jobs, "schedule": schedule, "verdicts": {"current": current, "waiting": waiting}}


IDLE = {"running": None, "auto": False, "done": 0, "total": 0, "started_at": None, "queued": False, "last": {}, "waiting": []}

__all__ = ["FAST", "IDLE", "KINDS", "LANES", "MAIN", "MANUAL", "NORMAL", "URGENT", "Batch", "Job", "Progress", "Queues"]
