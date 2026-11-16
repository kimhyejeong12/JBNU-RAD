from __future__ import annotations

import time

from sentinelai.db import auth, catalog, nodes, permissions
from sentinelai.db.core import audit
from sentinelai.web import notify


def _watcher(main_db, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send_slack", lambda url, text: sent.append(text))
    return notify.ExceptionWatcher("http://hook", main_db), sent


def _granted(main_db, people, who, code):
    catalog.create(main_db, people["top"], code, f"{code} 권한")
    no = permissions.submit(main_db, people[who], code, "업무")["request_no"]
    permissions.decide(main_db, people["manager"], no, "approve")
    permissions.decide(main_db, people["top"], no, "approve")
    return no


def test_accounts(main_db, people, monkeypatch):
    auth.update_user(main_db, people["root"], people["user2"].id, is_active=False)  # 웹이 뜨기 전 일은 알리지 않음
    watcher, sent = _watcher(main_db, monkeypatch)
    assert watcher.check() == []

    root = people["root"]
    auth.update_user(main_db, root, people["user"].id, role="manager")
    auth.update_user(main_db, root, people["user2"].id, is_active=True)
    auth.update_user(main_db, root, people["manager"].id, display_name="이름만")  # 역할 그대로면 안 알림
    auth.create_user(main_db, root, "new-top", "test-pass-1234", "새", "보안팀", "top")
    auth.create_user(main_db, root, "new-user", "test-pass-1234", "새", "인사팀", "user")
    [text] = watcher.check()
    assert text == ("[계정 역할 변경] 3건\n- 일반 사용자 → 보안 운영자\n- 일반 사용자 계정 다시 켬\n- 보안 총책임자 계정 만듦\n"
                    "SentinelAI 관리의 계정 관리에서 확인하세요")
    assert "user2" not in text and "사용자" not in text.split("\n")[0]
    assert watcher.check() == [] and len(sent) == 1


def test_held_grants(main_db, people, monkeypatch):
    moved = _granted(main_db, people, "user", "HR_SALARY_READ")
    _granted(main_db, people, "user2", "CRM_READ")
    watcher, _ = _watcher(main_db, monkeypatch)

    time.sleep(1.1)  # 이동이 신청 시각보다 늦게 기록돼야 재검토 대상입니다 (시각은 초 단위)
    auth.update_user(main_db, people["root"], people["user"].id, department="개발팀")
    [job] = permissions.pending_grant_reviews(main_db)
    move_id = int(job.split(":")[2])
    permissions.save_grant_review(main_db, moved, move_id, {"level": "주의", "failed": False}, "m")
    assert watcher.check() == []
    permissions.save_grant_review(main_db, moved, move_id, {"level": "위험", "reason": "업무가 바뀜", "failed": False}, "m")
    auth.update_user(main_db, people["root"], people["user2"].id, left_on="2026-01-01")
    assert watcher.check() == [
        f"[보유 권한 위험] 2건\n- 이동 뒤 재검토 위험: {moved} — HR_SALARY_READ 권한\n- 퇴사일이 지난 계정에 권한 1건 남음\n"
        "SentinelAI 권한 신청의 확인할 사람에서 확인하세요"]
    # 같은 퇴사자를 다시 알리지 않음
    auth.update_user(main_db, people["root"], people["user2"].id, display_name="바뀜")
    assert watcher.check() == []


def test_risky_approval_and_settings(main_db, people, monkeypatch):
    catalog.create(main_db, people["top"], "FW_ADMIN", "방화벽 정책 변경")
    catalog.create(main_db, people["top"], "CRM_READ", "CRM 조회")
    risky = permissions.submit(main_db, people["user"], "FW_ADMIN", "업무")["request_no"]
    calm = permissions.submit(main_db, people["user"], "CRM_READ", "업무")["request_no"]
    permissions.save_ai_verdict(main_db, risky, {"level": "위험", "reason": "직무와 무관", "failed": False}, "m")
    permissions.save_ai_verdict(main_db, calm, {"level": "정상", "reason": "업무", "failed": False}, "m")
    nodes.create(main_db, people["manager"], "web-01")
    watcher, _ = _watcher(main_db, monkeypatch)

    for no in (risky, calm):
        permissions.decide(main_db, people["manager"], no, "approve")
    assert watcher.check() == []  # 1차 승인은 아님
    for no in (risky, calm):
        permissions.decide(main_db, people["top"], no, "approve")
    catalog.update(main_db, people["top"], "CRM_READ", is_active=False)
    nodes.reissue_key(main_db, people["manager"], "web-01")
    nodes.set_enabled(main_db, people["manager"], "web-01", False)
    with main_db.transaction() as conn:
        audit(conn, "regulation_edit", people["top"].id, target_type="regulation", target_id="접근권한_관리기준.md")
        audit(conn, "queue_clear", people["top"].id, target_type="jobs", target_id="")
        audit(conn, "login_failed", target_type="user", target_id="x")  # 알리지 않는 기록
    approval, settings = watcher.check()
    assert approval == f"[AI 위험 판정 승인] 1건\n- {risky} — 인사팀 · 방화벽 정책 변경\nSentinelAI 권한 신청에서 확인하세요"
    assert settings == ("[보안 설정 변경] 5건\n- 권한 목록 고침: CRM_READ\n- 수집 노드 키 다시 발급: web-01\n- 수집 노드 끔: web-01\n"
                        "- 기준 문서 고침: 접근권한_관리기준.md\n- 작업 큐 초기화\nSentinelAI에서 확인하세요")
    assert watcher.check() == []


def test_off_without_url(main_db):
    watcher = notify.ExceptionWatcher("", main_db)
    watcher.start()
    assert watcher._thread is None
    watcher.stop()
