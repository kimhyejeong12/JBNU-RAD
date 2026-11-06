"""이동 · 만료 위험 — 이동 뒤 로그 감시 판정 · 끝난 사용 기간을 코드가 모읍니다 (모델 없이, 퇴사만인 사람은 뺌)."""
from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

from sentinelai.db import auth, catalog, permissions, results
from sentinelai.engine.issue import Issuer
from sentinelai.engine.queue import Queues
from sentinelai.sources import Sources

LOG = "data/연습용_로그_원본+합성.csv"   # 재무 정다은 = 로그 사용자 ID "5"


def _issuer(main_db, results_db) -> Issuer:
    sources = Sources(SimpleNamespace(events_source=LOG), main_db, results_db, None)
    return Issuer(SimpleNamespace(main_db=main_db, results_db=results_db, sources=sources), Queues())


def _grant(main_db, people, who, code, period_end=""):
    item = catalog.create(main_db, people["top"], code, f"{code} 권한", "인사 시스템", "급여정보")
    no = permissions.submit(main_db, people[who], item["code"], "업무", period_end=period_end)["request_no"]
    permissions.decide(main_db, people["manager"], no, "approve")
    permissions.decide(main_db, people["top"], no, "approve")
    return no


def _finding(at: str, reason: str) -> dict:
    return {"user": "5", "subject": "재무 정다은", "first_event_at": at, "last_event_at": at, "events": "-",
            "level": "위험", "reason": reason, "failed": False}


def test_move_and_findings_after_it(main_db, results_db, people):
    today = date.today()
    auth.update_user(main_db, people["root"], people["user"].id, department="재무팀", log_id="5")
    auth.update_user(main_db, people["root"], people["user"].id, department="영업팀")
    after = (today + timedelta(days=1)).isoformat() + "T01:00:00+00:00"
    before = (today - timedelta(days=30)).isoformat() + "T01:00:00+00:00"
    results.save_monitor_run(results_db, {"last_event_at": after, "findings": [_finding(before, "이동 전"), _finding(after, "예외 출력")]},
                             "m", stage="fast")
    [p] = _issuer(main_db, results_db).risk_people()["people"]
    assert p["level"] == "위험" and p["log_user"] == "재무 정다은"
    events = [f for f in p["flags"] if f["kind"] == "event"]
    assert [f["text"] for f in events] == ["로그 감시 위험 (1차): 예외 출력"] and events[0]["event_key"].startswith("event_findings/")
    assert any(f["kind"] == "move" for f in p["flags"])


def test_expired_grant_without_revoke(main_db, results_db, people):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    no = _grant(main_db, people, "user2", "HR_SALARY_READ", period_end=yesterday)
    [p] = _issuer(main_db, results_db).risk_people()["people"]
    assert p["id"] == people["user2"].id and p["level"] == "주의"
    assert p["flags"] == [{"kind": "expired", "level": "주의", "at": yesterday, "request_no": no,
                           "text": f"HR_SALARY_READ 권한 ({yesterday} 만료)"}]
    permissions.revoke(main_db, people["manager"], no, "사용 기간 만료")
    assert _issuer(main_db, results_db).risk_people()["people"] == []


def test_leave_only_is_not_here(main_db, results_db, people):
    _grant(main_db, people, "user", "HR_SALARY_READ")
    auth.update_user(main_db, people["root"], people["user"].id, left_on="2026-01-01")
    assert _issuer(main_db, results_db).risk_people()["people"] == []
