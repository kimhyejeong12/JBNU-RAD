"""권한 DB — 계정 · 로그인 · 권한 목록 · 신청 · 결재 · 회수 · 운영자 결정 · 노드. 규칙은 트리거가 막는지까지 봅니다."""
from __future__ import annotations

import re
import threading

import pytest

from sentinelai.db import Denied, auth, catalog, decisions, nodes, permissions

from .conftest import PASSWORD


def denied(message: str):
    return pytest.raises(Denied, match=re.escape(message))


@pytest.fixture
def item(main_db, people):
    return catalog.create(main_db, people["top"], "HR_SALARY_READ", "급여 테이블 조회", "인사 시스템", "급여정보")


@pytest.fixture
def request_no(main_db, people, item):
    return permissions.submit(main_db, people["user"], item["code"], "급여 정산 업무")["request_no"]


# --- 계정 · 로그인 --------------------------------------------------------------


def test_only_top_creates_accounts(main_db, people):
    with denied("계정은 보안 총책임자만 만들 수 있습니다"), main_db.transaction() as conn:
        conn.execute("INSERT INTO users (login_id, password_hash, display_name, role, created_at, created_by)"
                     " VALUES ('x', 'h', 'x', 'user', '2026-11-03', %s)", (people["manager"].id,))


def test_login_id_is_case_insensitive(main_db, people):
    with denied("이미 있는 아이디입니다"):
        auth.create_user(main_db, people["root"], "USER", PASSWORD, "다른 사람", "", "user")
    token, user = auth.login(main_db, "User", PASSWORD)
    assert user.id == people["user"].id
    assert auth.session_user(main_db, token) == user


def test_second_root_is_refused(main_db, people):
    with denied("루트 계정이 이미 있습니다"):
        auth.create_root(main_db, "root2", PASSWORD, "루트2")
    with denied("루트 계정이 이미 있습니다"), main_db.transaction() as conn:
        conn.execute("UPDATE users SET is_root = 1 WHERE id = %s", (people["top"].id,))


def test_failed_logins_lock_the_account(main_db, people):
    for _ in range(auth.MAX_FAILED_LOGINS - 1):
        with denied("아이디 또는 비밀번호가 맞지 않습니다"):
            auth.login(main_db, "user", "wrong")
    with denied("잠시 잠겼습니다"):
        auth.login(main_db, "user", "wrong")
    with denied("잠시 잠겼습니다"):
        auth.login(main_db, "user", PASSWORD)


def test_change_password_keeps_only_current_session(main_db, people):
    keep, user = auth.login(main_db, "user", PASSWORD)
    other, _ = auth.login(main_db, "user", PASSWORD)
    auth.change_password(main_db, user, PASSWORD, "new-pass-5678", keep)
    assert auth.session_user(main_db, keep) is not None
    assert auth.session_user(main_db, other) is None


def test_deactivate_with_bool_revokes_sessions(main_db, people):
    token, _ = auth.login(main_db, "user", PASSWORD)
    auth.update_user(main_db, people["top"], people["user"].id, is_active=False)
    assert auth.session_user(main_db, token) is None
    with denied("정지된 계정입니다"):
        auth.login(main_db, "user", PASSWORD)


def test_log_id_is_unique(main_db, people):
    auth.update_user(main_db, people["top"], people["user"].id, log_id="kim.hj")
    with denied("다른 계정이 이미 쓰는 로그 사용자 ID 입니다"):
        auth.update_user(main_db, people["top"], people["user2"].id, log_id="kim.hj")


def test_root_is_guarded(main_db, people):
    with denied("루트 계정은 루트만 고칠 수 있습니다"):
        auth.reset_password(main_db, people["top"], people["root"].id, "temp-pass")


# --- 권한 목록 ---------------------------------------------------------------


def test_catalog_rules(main_db, people, item):
    with denied("권한 목록은 보안 총책임자만 관리할 수 있습니다"), main_db.transaction() as conn:
        conn.execute("INSERT INTO access_catalog (code, name, created_by, created_at, updated_at)"
                     " VALUES ('X', 'x', %s, 'now', 'now')", (people["manager"].id,))
    with denied("권한 코드는 바꿀 수 없습니다"), main_db.transaction() as conn:
        conn.execute("UPDATE access_catalog SET code = 'OTHER'")
    with denied("권한은 지우지 않고 끕니다"), main_db.transaction() as conn:
        conn.execute("DELETE FROM access_catalog")
    with denied("허용되지 않는 값입니다"), main_db.transaction() as conn:
        conn.execute("INSERT INTO access_catalog (code, name, created_by, created_at, updated_at)"
                     " VALUES ('bad code!', 'x', %s, 'now', 'now')", (people["top"].id,))
    off = catalog.update(main_db, people["top"], item["code"], is_active=False)
    assert off["is_active"] is False
    assert catalog.list_items(main_db, people["user"]) == []
    with denied("지금은 신청할 수 없는 권한입니다"):
        permissions.submit(main_db, people["user"], item["code"])


# --- 신청 · 결재 · 회수 -----------------------------------------------------------


def test_full_approval_and_revoke(main_db, people, item, request_no):
    assert re.fullmatch(r"REQ-\d{8}-001", request_no)
    req = permissions.get(main_db, people["user"], request_no)
    assert req["stage"] == "manager" and req["current_access"] == ""

    req = permissions.decide(main_db, people["manager"], request_no, "approve", "업무상 필요")
    assert req["stage"] == "top" and req["approvals"][0]["approver_name"] == "운영자"
    req = permissions.decide(main_db, people["top"], request_no, "approve")
    assert req["stage"] == "approved" and req["closed_at"]
    assert [r["request_no"] for r in permissions.held_by_account(main_db)[people["user"].id]] == [request_no]
    with main_db.connection() as conn:
        assert conn.execute("SELECT count(*) FROM active_grants").fetchone()[0] == 1

    # 가진 권한은 다시 신청하지 못하고, 다른 권한 신청의 현재 보유 권한에 남습니다.
    with denied("이미 가진 권한입니다"):
        permissions.submit(main_db, people["user"], item["code"])
    catalog.create(main_db, people["top"], "CRM_READ", "CRM 조회")
    second = permissions.submit(main_db, people["user"], "CRM_READ")
    assert second["request_no"].endswith("-002") and "급여 테이블 조회" in second["current_access"]

    with denied("권한 회수는 보안 운영자 · 보안 총책임자만 할 수 있습니다"):
        permissions.revoke(main_db, people["user"], request_no, "그냥")
    req = permissions.revoke(main_db, people["manager"], request_no, "업무 종료")
    assert req["stage"] == "revoked" and req["revocation"]["revoker_name"] == "운영자"
    with denied("이미 회수한 권한입니다"):
        permissions.revoke(main_db, people["top"], request_no, "다시")


def test_decision_order_is_enforced(main_db, people, request_no):
    with denied("지금 결재 단계가 아닙니다"):
        permissions.decide(main_db, people["top"], request_no, "approve")
    permissions.decide(main_db, people["manager"], request_no, "reject", "사유 부족")
    with denied("이미 결재한 단계입니다"):
        permissions.decide(main_db, people["manager"], request_no, "approve")
    assert permissions.get(main_db, people["user"], request_no)["stage"] == "rejected"
    with denied("승인된 권한만 회수할 수 있습니다"):
        permissions.revoke(main_db, people["top"], request_no, "회수")


def test_request_rows_are_frozen(main_db, people, request_no):
    with denied("허용되지 않은 상태 변경입니다"), main_db.transaction() as conn:
        conn.execute("UPDATE access_requests SET stage = 'approved'")
    with denied("제출한 신청 내용은 고칠 수 없습니다"), main_db.transaction() as conn:
        conn.execute("UPDATE access_requests SET reason = '바꿈'")
    with denied("신청 기록은 지울 수 없습니다"), main_db.transaction() as conn:
        conn.execute("DELETE FROM access_requests")
    with denied("권한 신청은 일반 사용자만 할 수 있습니다"), main_db.transaction() as conn:
        conn.execute("INSERT INTO access_requests (request_no, requester_id, requester_name, requested_access, access_code, submitted_at)"
                     " VALUES ('REQ-20261103-999', %s, 'x', 'x', 'HR_SALARY_READ', 'now')", (people["manager"].id,))
    with denied("허용되지 않는 값입니다"), main_db.transaction() as conn:
        conn.execute("INSERT INTO access_requests (request_no, requester_id, requester_name, requested_access, access_code, submitted_at)"
                     " VALUES ('REQ-2026-1', %s, 'x', 'x', 'HR_SALARY_READ', 'now')", (people["user"].id,))


def test_withdraw(main_db, people, request_no):
    with denied("본인 신청만 철회할 수 있습니다"):
        permissions.withdraw(main_db, people["user2"], request_no)
    assert permissions.withdraw(main_db, people["user"], request_no)["stage"] == "withdrawn"
    with denied("볼 수 없는 신청입니다"):
        permissions.get(main_db, people["user2"], request_no)


def test_ai_verdict_freezes_at_first_decision(main_db, people, request_no):
    verdict = {"level": "주의", "reason": "급여 정보", "recommendation": "추가 검토", "sources": ["3.3"], "failed": False, "elapsed_sec": 1.5}
    assert permissions.unjudged(main_db) == [request_no]
    assert permissions.save_ai_verdict(main_db, request_no, verdict, "qwen3:14b")
    assert permissions.unjudged(main_db) == []
    permissions.decide(main_db, people["manager"], request_no, "approve")
    assert not permissions.save_ai_verdict(main_db, request_no, {**verdict, "level": "위험"}, "qwen3:14b")
    with denied("1차 결재 뒤에는 AI 판정을 바꿀 수 없습니다"), main_db.transaction() as conn:
        conn.execute("UPDATE access_requests SET ai_level = '위험'")
    req = permissions.get(main_db, people["top"], request_no)
    assert req["ai_verdict"]["level"] == "주의" and req["ai_verdict"]["elapsed_sec"] == 1.5
    assert req["approvals"][0]["ai_level"] == "주의"
    stats = permissions.request_stats(main_db)
    assert stats == {"total": 1, "ai": {"주의": 1}, "mismatches": 0}
    assert permissions.user_requests(main_db)[0]["ai"] == "주의"


def test_concurrent_submits_get_distinct_numbers(main_db, people):
    codes = [f"CODE_{n}" for n in range(6)]
    for code in codes:
        catalog.create(main_db, people["top"], code, code)
    numbers, errors = [], []

    def submit(code: str) -> None:
        try:
            numbers.append(permissions.submit(main_db, people["user"], code)["request_no"])
        except Exception as exc:  # noqa: BLE001 — 실패도 모아서 봅니다
            errors.append(exc)

    threads = [threading.Thread(target=submit, args=(c,)) for c in codes]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    assert sorted(n[-3:] for n in numbers) == [f"{n:03d}" for n in range(1, 7)]


# --- 운영자 결정 · 노드 -----------------------------------------------------------


def test_review_decisions(main_db, people):
    decisions.record(main_db, people["manager"], "policy", "policy_issues/1", "approve", ai_level="주의")
    assert decisions.record(main_db, people["top"], "policy", "policy_issues/1", "cancel") is None
    decisions.record(main_db, people["top"], "server", "node_findings/3", "act")
    assert set(decisions.current(main_db, "server")) == {"node_findings/3"}
    assert len(decisions.history(main_db, "policy")["policy_issues/1"]) == 2
    with denied("정책 · 로그 결정은 보안 운영자 · 보안 총책임자만 할 수 있습니다"):
        decisions.record(main_db, people["user"], "event", "event_findings/1", "clear")
    with denied("결정 기록은 고칠 수 없습니다"), main_db.transaction() as conn:
        conn.execute("UPDATE review_decisions SET comment = 'x'")
    with denied("결정 기록은 지울 수 없습니다"), main_db.transaction() as conn:
        conn.execute("DELETE FROM review_decisions")


def test_nodes(main_db, people):
    node, key = nodes.create(main_db, people["manager"], "web-01")
    assert node["key_issued"] and nodes.key_of(main_db, people["manager"], "web-01") == key
    seen = nodes.authenticate(main_db, key, {"host": "web-01", "ip": "10.0.0.5", "interval_min": 5})
    assert seen["ip"] == "10.0.0.5" and seen["interval_min"] == 5
    nodes.mark_collected(main_db, "web-01", "2026-11-03T01:00:00+00:00")
    nodes.mark_collected(main_db, "web-01", "2026-11-02T01:00:00+00:00")   # 늦게 온 예전 수집은 마지막 시각을 되돌리지 않습니다
    assert nodes.list_nodes(main_db)[0]["last_collected_at"] == "2026-11-03T01:00:00+00:00"
    assert nodes.set_enabled(main_db, people["top"], "web-01", False)["enabled"] is False
    assert nodes.enabled_names(main_db) == set()
    with denied("꺼 둔 노드입니다"):
        nodes.authenticate(main_db, key, {})
    _, new_key = nodes.reissue_key(main_db, people["top"], "web-01")
    with pytest.raises(nodes.Unauthorized):
        nodes.authenticate(main_db, key, {})
    assert new_key != key
