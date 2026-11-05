"""종류별 큐 — 길 순서 · 같은 key 한 번만 · 묶음 닫기 잡이 마지막 · 취소 · 강제 중지 · 화면 상태 모양 (모델 · DB 없이)."""
from __future__ import annotations

from sentinelai.engine.queue import IDLE, Job, Queues


def _drain(q: Queues, ran: list[str], stop_at: str | None = None) -> None:
    """워커 대신 꺼내 끝냅니다. 묶음 잡은 key 를, 닫기 잡은 'close' 를 남깁니다."""
    while (job := q.take(q.generation, block=False)) is not None:
        ran.append("close" if job.close else job.key)
        if job.key == stop_at:
            return
        q.finish(job, q.generation, "done", None, {"key": job.key})


def test_lanes_then_arrival_order():
    q, ran = Queues(), []
    batch = q.open("suspects")
    q.fill(batch, [("suspects:a", 1), ("suspects:b", 2)])
    q.submit(Job("events_fast", "events_fast:x"))
    q.submit(Job("request", "REQ-1"))
    _drain(q, ran)
    assert ran == ["REQ-1", "events_fast:x", "suspects:a", "suspects:b", "close"]
    assert batch.status == "done" and batch.done == 2 and q.last()["suspects"]["error"] is None


def test_same_key_and_same_kind_once():
    q = Queues()
    first, new = q.submit(Job("request", "REQ-1"))
    again, new_again = q.submit(Job("request", "REQ-1"))
    assert new and not new_again and again is first
    assert q.open("nodes") is not None and q.open("nodes") is None
    assert q.pending("REQ-1") and q.pending("nodes")


def test_urgent_job_cuts_in_between_batch_items():
    q, ran = Queues(), []
    batch = q.open("events")
    q.fill(batch, [("events:a", 1), ("events:b", 2)])
    _drain(q, ran, stop_at="events:a")
    q.finish(q._running, q.generation, "done", None, {})
    q.submit(Job("request", "REQ-9"))
    _drain(q, ran)
    assert ran == ["events:a", "REQ-9", "events:b", "close"]


def test_reset_drops_running_batch_and_old_worker_results():
    q, ran = Queues(), []
    progressed: list[int] = []
    batch = q.open("nodes", progress=lambda done, total, item: progressed.append(done))
    q.fill(batch, [("nodes:a", 1), ("nodes:b", 2)])
    old = q.generation
    job = q.take(old)
    assert q.live(job, old)
    assert q.reset() == [batch]
    assert not q.live(job, old) and batch.status == "cancelled" and not q.pending("nodes")
    q.finish(job, old, "done", None, {})  # 옛 워커가 늦게 돌아와도 아무것도 쓰지 않습니다
    _drain(q, ran)
    assert ran == [] and progressed == [] and q.last()["nodes"]["error"] == "강제로 끝냈습니다"


def test_cancel_waiting_only_leaves_running_job():
    q = Queues()
    q.submit(Job("index", "index:1", work=lambda: None))
    q.submit(Job("index", "index:2", work=lambda: None))
    running = q.take(q.generation)
    assert q.cancel("index:1", waiting_only=True) is None and running.status == "running"
    waiting = q.cancel("index:2", waiting_only=True)
    assert waiting.status == "cancelled" and waiting.finished.is_set() and not q.pending("index:2")


def test_job_status_shape():
    q = Queues()
    assert set(q.job_status({})) == set(IDLE)
    batch = q.open("policies")
    q.fill(batch, [("policies:review", 1)])
    q.fill(q.open("events_fast"), [])
    status = q.job_status({"events_fast": {"every_min": 5, "next_at": "2026-11-05T00:00:00"}})
    assert status["running"] == "policies" and status["queued"] and status["waiting"][0]["kind"] == "policies"
    assert [w["kind"] for w in status["waiting"]] == ["policies"]
    assert status["fast"]["every_min"] == 5 and status["fast"]["running"] is None
    fast = q.take(q.generation)
    q.finish(fast, q.generation, "done", None, {})
    q.take(q.generation)
    status = q.status({})
    assert status["jobs"]["running"] == "policies" and not status["jobs"]["queued"] and status["jobs"]["total"] == 1
    assert status["verdicts"] == {"current": None, "waiting": []}
