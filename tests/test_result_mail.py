from __future__ import annotations

from sentinelai.db import auth, catalog, permissions
from sentinelai.web import notify


def test_result_mail(main_db, people, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send_mail", lambda mail, to, subject, body: sent.append((to, subject, body)))
    mail = notify.Mail(host="smtp.example.com", port=587, user="", password="", sender="sentinel@example.com")
    auth.update_user(main_db, people["root"], people["user"].id, email="user@example.com")
    catalog.create(main_db, people["top"], "HR_SALARY_READ", "급여 테이블 조회")
    no = permissions.submit(main_db, people["user"], "HR_SALARY_READ", "급여 정산 업무")["request_no"]

    # 결재 대기 · 1차 승인은 메일이 아님
    req = permissions.decide(main_db, people["manager"], no, "approve", "업무상 필요")
    notify.notify_result(mail, main_db, req)
    assert sent == []

    req = permissions.decide(main_db, people["top"], no, "approve")
    notify.notify_result(mail, main_db, req)
    assert sent[-1][:2] == ("user@example.com", f"[SentinelAI] 권한 신청 {no} 승인")

    req = permissions.revoke(main_db, people["manager"], no, "퇴사 예정자 정리")
    notify.notify_result(mail, main_db, req)
    to, subject, body = sent[-1]
    assert (to, subject) == ("user@example.com", f"[SentinelAI] 권한 신청 {no} 회수")
    assert body.splitlines()[0] == "승인됐던 권한이 회수되었습니다."
    assert "급여 테이블 조회" in body and "퇴사 예정자" not in body and "운영자" not in body
    assert len(sent) == 2

    # 이메일이 없으면 회수돼도 안 보냄
    catalog.create(main_db, people["top"], "CRM_READ", "CRM 조회")
    other = permissions.submit(main_db, people["user2"], "CRM_READ", "고객 응대")["request_no"]
    permissions.decide(main_db, people["manager"], other, "approve")
    permissions.decide(main_db, people["top"], other, "approve")
    notify.notify_result(mail, main_db, permissions.revoke(main_db, people["top"], other, "사용 기간 만료"))
    assert len(sent) == 2


def test_result_message_rejects():
    base = {"request_no": "REQ-20261109-001", "requested_access": "CRM 조회"}
    first = {**base, "stage": "rejected", "approvals": [{"step": "manager", "action": "reject"}]}
    final = {**base, "stage": "rejected", "approvals": [{"step": "manager", "action": "approve"}, {"step": "top", "action": "reject"}]}
    assert notify.result_message(first)[1].startswith("신청하신 권한이 1차 결재에서 반려되었습니다.")
    assert notify.result_message(final)[1].startswith("신청하신 권한이 최종 결재에서 반려되었습니다.")
    assert notify.result_message({**base, "stage": "withdrawn", "approvals": []}) is None
