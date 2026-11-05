"""맥락 빌더 — 예산 자르기 · 빠른 감시의 짧은 맥락 · 신청 시각 이전으로 자르기."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from sentinelai.context import Section, fit
from sentinelai.context import person as about
from sentinelai.db import auth, catalog, permissions
from sentinelai.sources import People, Person, SecurityEvent


def _event(at: datetime, who: str = "7", **attrs: str) -> SecurityEvent:
    return SecurityEvent(solution="SecureMark", occurred_at=at, who="정다은", user_id=who, department="재무", where="PC", how="출력행위",
                         attributes=attrs)


def test_fit_drops_low_trim_first_and_says_so():
    sections = [Section("a", ["대상"]), Section("b", [f"옛 신청 {i}" for i in range(10)], cut="requests"),
                Section("c", ["위협 1", "위협 2"], cut="threats")]
    built = fit(sections, 30)
    assert built.inputs["a"] == "대상"
    assert built.inputs["c"] == "위협 1\n위협 2"
    assert built.inputs["b"].startswith("(오래된 ") and built.inputs["b"].endswith("옛 신청 9")
    assert built.trimmed == {"b": built.trimmed["b"]} and built.trimmed["b"] >= 6
    untouched = fit([Section("a", ["x"]), Section("b", ["y"], cut="requests"), Section("z", [], empty="없음")], 1000)
    assert untouched.trimmed == {} and untouched.inputs == {"a": "x", "b": "y", "z": "없음"}


def test_short_context_is_account_and_held_only():
    account = {"department": "재무팀", "job": "정산", "is_active": 1, "created_at": "2026-10-01", "left_on": "", "moves": [], "requests": [],
               "held": [{"requested_access": "CRM 조회", "access_code": "CRM_READ", "system": "CRM", "category": "고객정보", "period_end": ""}]}
    now = datetime(2026, 10, 20, 1, tzinfo=timezone.utc)
    decided = [{"decided_at": "2026-10-20T02:00:00", "at": "2026-10-20T01:00:00", "decider_name": "운영자", "action": "act", "comment": ""}]
    person = Person(account, "7", [_event(now, Exception="1")], None, decided)
    short = "\n".join(line for s in about.short(person) for line in s.lines)
    assert "직무 정산" in short and "CRM 조회 (CRM_READ) · CRM / 고객정보 · 기간 없음" in short
    assert "위협" not in short and "신청" not in short
    full = "\n".join(line for s in about.full(person) for line in s.lines)
    assert "운영자이(가) 조치 필요로 정함" in full and "[예외 승인" in full
    judged = "\n".join(line for s in about.full(person, skip=person.events) for line in s.lines)
    assert "[예외 승인" not in judged


def test_people_before_cuts_later_moves_requests_and_logs(main_db, results_db, people):
    root, user = people["root"], people["user"]
    auth.update_user(main_db, root, user.id, log_id="7", job="채용")
    catalog.create(main_db, root, "HR_MASTER_READ", "인사정보 조회", "인사 시스템", "인사정보", "HR_MASTER 읽기")
    first = permissions.submit(main_db, user, "HR_MASTER_READ", reason="채용 검토")
    cut = first["submitted_at"]
    time.sleep(1.1)
    auth.update_user(main_db, root, user.id, department="재무팀")
    later = permissions.withdraw(main_db, user, first["request_no"]) and permissions.submit(main_db, user, "HR_MASTER_READ", reason="다시")
    at = datetime.fromisoformat(cut)
    events = [_event(at - timedelta(days=1)), _event(at + timedelta(days=1), PrintCount="300")]
    found = People(main_db, results_db, events)

    before = found.get(user.id, before=cut)
    assert before.account["moves"] == [] and before.account["requests"] == []
    assert len(before.events) == 1
    now = found.get(user.id)
    assert len(now.account["moves"]) == 1 and len(now.account["requests"]) == 2 and later["request_no"]
    assert len(now.events) == 2
    assert found.get(log_id="7").account["id"] == user.id
