from __future__ import annotations

from sentinelai.db import results, watch
from sentinelai.web import notify


def _run(db, stage, *findings):
    last = max(f["last_event_at"] for f in findings)
    results.save_monitor_run(db, {"last_event_at": last, "findings": list(findings)}, "m", stage=stage)


def _f(user, first, last, level="위험"):
    return {"user": user, "subject": "", "first_event_at": first, "last_event_at": last, "events": "- 로그", "level": level,
            "reason": "", "failed": False}


def test_findings_after(results_db):
    assert watch.last_finding_id(results_db) == 0
    base = {"user": "kim.hj", "subject": "인사팀 김혜정", "first_event_at": "2026-11-01T10:00:00+00:00",
            "last_event_at": "2026-11-01T11:00:00+00:00", "events": "- 로그", "level": "위험", "failed": False}
    results.save_monitor_run(results_db, {"last_event_at": "2026-11-01T11:00:00+00:00", "findings": [base]}, "m", stage="fast")
    start = watch.last_finding_id(results_db)
    results.save_monitor_run(results_db, {"last_event_at": "2026-11-01T12:00:00+00:00", "findings": [
        {**base, "user": "lee", "level": "주의"},
        {**base, "user": "park", "level": None, "failed": True, "error": "모델 응답 없음"},
        {**base, "user": "choi"},
    ]}, "m")

    found = watch.findings_after(results_db, start)
    assert [(f["user"], f["stage"]) for f in found] == [("choi", "final")]
    assert found[0]["first_event_at"] == "2026-11-01T10:00:00+00:00" and found[0]["events"] == "- 로그"
    assert [f["user"] for f in watch.findings_after(results_db, 0)] == ["kim.hj", "choi"]
    assert [f["user"] for f in watch.findings_after(results_db, start, "주의")] == ["lee"]


def test_risk_watcher(results_db, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send_slack", lambda url, alert: sent.append(alert))
    _run(results_db, "final", _f("old", "2026-11-01T09:00:00+00:00", "2026-11-01T09:10:00+00:00"))

    watcher = notify.RiskWatcher(notify.Chat(slack="http://hook"), results_db)
    assert watcher.check() == []  # 웹이 뜨기 전 판정은 알리지 않음

    _run(results_db, "fast", _f("kim", "2026-11-02T10:00:00+00:00", "2026-11-02T10:05:00+00:00"),
         _f("lee", "2026-11-02T10:01:00+00:00", "2026-11-02T10:02:00+00:00", "주의"))
    [first] = watcher.check()   # 위험 판정 한 건 = 카드 한 장
    assert first.splitlines()[0] == "로그 감시 위험" and first.splitlines()[1].endswith("· 1차 판정")

    # 확정: kim 은 1차 때 알린 구간과 겹쳐 넘기고, 1차 때 없던 park 만 알림
    _run(results_db, "final", _f("kim", "2026-11-02T10:00:00+00:00", "2026-11-02T10:30:00+00:00"),
         _f("park", "2026-11-02T10:10:00+00:00", "2026-11-02T10:20:00+00:00"))
    [final] = watcher.check()
    assert final.splitlines()[1].endswith("· 확정")

    # 같은 사람이라도 구간이 다르면 다시 알림
    _run(results_db, "final", _f("kim", "2026-11-03T08:00:00+00:00", "2026-11-03T08:10:00+00:00"))
    assert len(watcher.check()) == 1
    assert watcher.check() == []
    assert len(sent) == 3 and sent[0].tone == "risk"


def test_risk_watcher_off_without_url(results_db):
    watcher = notify.RiskWatcher(notify.Chat(), results_db)
    watcher.start()
    assert watcher._thread is None
    watcher.stop()
