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

    req = permissions.decide(main_db, people["top"], no, "approve", "승인 의견")
    notify.notify_result(mail, main_db, req)
    to, subject, body = sent[-1]
    assert (to, subject) == ("user@example.com", f"[SentinelAI] 권한 신청 {no} 승인")
    assert "승인 의견" not in body and "의견:" not in body

    req = permissions.revoke(main_db, people["manager"], no, "퇴사 예정자 정리")
    notify.notify_result(mail, main_db, req)
    to, subject, body = sent[-1]
    assert (to, subject) == ("user@example.com", f"[SentinelAI] 권한 신청 {no} 회수")
    assert body.splitlines()[0] == "승인됐던 권한이 회수되었습니다."
    assert "권한: 급여 테이블 조회" in body and "회수 사유: 퇴사 예정자 정리" in body
    # 회수자 · 신청 사유는 넣지 않음
    assert "운영자" not in body and "급여 정산 업무" not in body
    assert len(sent) == 2

    # 이메일이 없으면 회수돼도 안 보냄
    catalog.create(main_db, people["top"], "CRM_READ", "CRM 조회")
    other = permissions.submit(main_db, people["user2"], "CRM_READ", "고객 응대")["request_no"]
    permissions.decide(main_db, people["manager"], other, "approve")
    permissions.decide(main_db, people["top"], other, "approve")
    notify.notify_result(mail, main_db, permissions.revoke(main_db, people["top"], other, "사용 기간 만료"))
    assert len(sent) == 2


def test_reject_mail_has_comment(main_db, people):
    catalog.create(main_db, people["top"], "A", "권한A")
    catalog.create(main_db, people["top"], "B", "권한B")
    first = permissions.submit(main_db, people["user"], "A", "업무")["request_no"]
    req = permissions.decide(main_db, people["manager"], first, "reject", "인사팀 업무가 아님")
    subject, body = notify.result_message(req)
    assert subject.endswith("반려") and body.splitlines()[0] == "신청하신 권한이 1차 결재에서 반려되었습니다."
    assert "반려 의견: 인사팀 업무가 아님" in body and "운영자" not in body

    final = permissions.submit(main_db, people["user"], "B", "업무")["request_no"]
    permissions.decide(main_db, people["manager"], final, "approve", "괜찮아 보임")
    req = permissions.decide(main_db, people["top"], final, "reject")
    body = notify.result_message(req)[1]
    assert body.splitlines()[0] == "신청하신 권한이 최종 결재에서 반려되었습니다."
    assert "반려 의견: (적지 않음)" in body and "괜찮아 보임" not in body


def test_result_message_skips_unfinished():
    base = {"request_no": "REQ-20261109-001", "requested_access": "CRM 조회", "approvals": []}
    for stage in ("manager", "top", "withdrawn"):
        assert notify.result_message({**base, "stage": stage}) is None
