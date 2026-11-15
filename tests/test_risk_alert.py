from __future__ import annotations

from sentinelai.db import results
from sentinelai.web import notify


def _run(db, stage, *findings):
    last = max(f["last_event_at"] for f in findings)
    results.save_monitor_run(db, {"last_event_at": last, "findings": list(findings)}, "m", stage=stage)


def _f(user, first, last, level="위험"):
    return {"user": user, "subject": "", "first_event_at": first, "last_event_at": last, "events": "- 로그", "level": level,
            "failed": False}


def test_risk_watcher(results_db, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send_slack", lambda url, text: sent.append(text))
    _run(results_db, "final", _f("old", "2026-11-01T09:00:00+00:00", "2026-11-01T09:10:00+00:00"))

    watcher = notify.RiskWatcher("http://hook", results_db)
    assert watcher.check() == []  # 웹이 뜨기 전 판정은 알리지 않음

    _run(results_db, "fast", _f("kim", "2026-11-02T10:00:00+00:00", "2026-11-02T10:05:00+00:00"),
         _f("lee", "2026-11-02T10:01:00+00:00", "2026-11-02T10:02:00+00:00", "주의"))
    assert watcher.check() == ["[로그 감시 위험 · 1차 판정] 1건\nSentinelAI 로그 감시에서 확인하세요"]

    # 확정: kim 은 1차 때 알린 구간과 겹쳐 넘기고, 1차 때 없던 park 만 알림
    _run(results_db, "final", _f("kim", "2026-11-02T10:00:00+00:00", "2026-11-02T10:30:00+00:00"),
         _f("park", "2026-11-02T10:10:00+00:00", "2026-11-02T10:20:00+00:00"))
    assert watcher.check() == ["[로그 감시 위험 · 확정] 1건\nSentinelAI 로그 감시에서 확인하세요"]

    # 같은 사람이라도 구간이 다르면 다시 알림
    _run(results_db, "final", _f("kim", "2026-11-03T08:00:00+00:00", "2026-11-03T08:10:00+00:00"))
    assert len(watcher.check()) == 1
    assert watcher.check() == []
    assert len(sent) == 3


def test_risk_watcher_off_without_url(results_db):
    watcher = notify.RiskWatcher("", results_db)
    watcher.start()
    assert watcher._thread is None
    watcher.stop()
