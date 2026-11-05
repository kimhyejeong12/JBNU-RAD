"""통합 잡 큐 — 우선순위 · 같은 일 한 번만 · 급한 일에 자리 내주기 · 취소 · 강제 중지 · 예약 (모델 없이 가짜 일)."""
from __future__ import annotations

import threading
import time

import pytest

from sentinelai.engine.jobs import FAST, NORMAL, URGENT, JobQueue


@pytest.fixture
def q():
    queue = JobQueue()
    yield queue
    queue.stop(timeout=1)


def _gate(q: JobQueue, ran: list[str]):
    """일꾼을 붙잡아 두는 일 — open.set() 하면 끝납니다."""
    started, open_ = threading.Event(), threading.Event()

    def work(_progress):
        started.set()
        open_.wait(5)
        ran.append("gate")
    job, _ = q.submit("gate", work)
    assert started.wait(2)
    return job, open_


def test_priority_order_and_dedupe(q):
    ran: list[str] = []
    gate, open_ = _gate(q, ran)
    a, new_a = q.submit("events", lambda p: ran.append("events"))
    again, new_again = q.submit("events", lambda p: ran.append("twice"))
    b, _ = q.submit("request", lambda p: ran.append("request"), key="REQ-1", priority=URGENT)
    assert new_a and not new_again and again is a
    assert q.pending("REQ-1") and [j.key for j in q.waiting()] == ["REQ-1", "events"]
    open_.set()
    assert a.wait(2) and b.wait(2)
    assert ran == ["gate", "request", "events"]
    assert q.last()["events"]["error"] is None and not q.pending("events")


def test_long_job_yields_to_urgent_at_progress(q):
    ran: list[str] = []
    step = threading.Event()

    def long(progress):
        for n in range(1, 4):
            ran.append(f"long {n}")
            if n == 1:
                step.set()
                time.sleep(0.2)
            progress(n, 3)
        return "ok"
    job, _ = q.submit("suspects", long)
    assert step.wait(2)
    urgent, _ = q.submit("request", lambda p: ran.append("request"), key="REQ-2", priority=URGENT)
    assert job.wait(2) and urgent.wait(2)
    assert ran == ["long 1", "request", "long 2", "long 3"]
    assert job.result == "ok" and (job.done, job.total) == (3, 3)


def test_cancel_waiting_and_failed_job(q):
    ran: list[str] = []
    gate, open_ = _gate(q, ran)
    waiting, _ = q.submit("nodes", lambda p: ran.append("nodes"))
    assert q.cancel("nodes").status == "cancelled" and waiting.wait(0)
    assert q.cancel("gate", waiting_only=True) is None
    broken, _ = q.submit("policies", lambda p: 1 / 0)
    open_.set()
    assert broken.wait(2) and broken.status == "failed" and "ZeroDivisionError" in broken.error
    assert q.last()["policies"]["error"].startswith("ZeroDivisionError") and "nodes" not in ran


def test_reset_frees_queue_from_stuck_job(q):
    """응답 없는 모델 호출에 묶인 일을 끝내면 새 일꾼이 다음 일을 돌리고, 옛 일은 돌아와도 결과를 남기지 않습니다."""
    stuck, release = threading.Event(), threading.Event()
    saved: list[str] = []

    def hang(progress):
        stuck.set()
        release.wait(5)
        progress(1, 1)
        saved.append("hang")
    job, _ = q.submit("nodes", hang)
    assert stuck.wait(2)
    stopped = q.reset()
    assert [j.key for j in stopped] == ["nodes"] and job.status == "cancelled" and q.running() == []
    assert q.last()["nodes"]["error"] == "강제로 끝냈습니다"
    after, _ = q.submit("nodes", lambda p: saved.append("again"))
    assert after.wait(2) and saved == ["again"]
    release.set()
    time.sleep(0.2)
    assert saved == ["again"] and job.status == "cancelled"


def test_every_runs_now_and_skips_when_pending(q):
    ran: list[str] = []
    gate, open_ = _gate(q, ran)
    q.submit("events", lambda p: ran.append("manual"))
    q.every("events", 1, lambda: (lambda p: ran.append("auto"), NORMAL))
    q.every("events_fast", 1, lambda: (lambda p: ran.append("fast"), FAST))
    q.every("off", 0, lambda: (lambda p: ran.append("off"), NORMAL))
    time.sleep(0.3)
    assert set(q.schedule()) == {"events", "events_fast"} and q.schedule()["events"]["every_min"] == 1
    open_.set()
    time.sleep(0.3)
    assert ran == ["gate", "fast", "manual"]


def test_stop_cancels_running(q):
    def loop(progress):
        for n in range(100):
            time.sleep(0.02)
            progress(n, 100)
    job, _ = q.submit("suspects", loop)
    time.sleep(0.1)
    q.stop(timeout=2)
    assert job.wait(1) and job.status == "cancelled"
