from __future__ import annotations

from sentinelai.db import catalog, permissions
from sentinelai.web import notify
from sentinelai.web.alert_cards import Alert, alert_text

ALERT = Alert(title="계정 역할 변경 1건", tone="warn", badge="주의", items=("일반 사용자 → 보안 운영자",),
              todo="관리의 계정 관리에서 변경 이력 확인")
REQ = {"stage": "manager", "request_no": "REQ-20261115-001", "requester_name": "김혜정", "requester_department": "인사팀",
       "requester_job": "서버 운영 담당", "requested_access": "급여 테이블 조회", "reason": "급여 정산", "period_start": "", "period_end": "",
       "ai_verdict": {"level": "주의", "reason": "김혜정의 직무(서버 운영)와 권한 연관성이 낮습니다. 사유도 짧습니다.", "failed": False}}


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "_post", lambda url, payload, name: sent.append((name, url, payload)))
    return sent


def test_same_alert_to_each_channel(monkeypatch):
    sent = _capture(monkeypatch)
    notify.send_chat(notify.Chat(slack="https://slack.example/hook", teams="https://teams.example/hook"), ALERT)
    (slack_name, slack_url, slack), (teams_name, teams_url, teams) = sent
    assert (slack_name, slack_url) == ("Slack", "https://slack.example/hook")
    assert slack["text"] == alert_text(ALERT)   # 알림 미리보기에 뜨는 글
    assert slack["attachments"][0]["blocks"][1]["text"]["text"] == "*계정 역할 변경 1건*"
    assert (teams_name, teams_url) == ("Teams", "https://teams.example/hook")
    [attachment] = teams["attachments"]
    assert teams["type"] == "message" and attachment["contentType"] == "application/vnd.microsoft.card.adaptive"
    assert attachment["content"]["body"][1]["text"] == "계정 역할 변경 1건"


def test_only_configured_channels(monkeypatch):
    sent = _capture(monkeypatch)
    notify.send_chat(notify.Chat(teams="https://teams.example/hook"), ALERT)
    notify.send_chat(notify.Chat(), ALERT)
    assert [name for name, _, _ in sent] == ["Teams"]
    assert not notify.Chat().on and notify.Chat(teams="x").on


def test_waiting_alert_card():
    text = alert_text(notify.waiting_alert(REQ))
    # 제목에 무엇을 결재할지, 바로 아래 AI 사전 검토 한 문장, 그 아래 신청자 · 기간
    assert text.splitlines() == ["1차 결재 대기 - 급여 테이블 조회", "결재 대기 · REQ-20261115-001",
                                 "AI 사전 검토: 주의 — 신청자의 직무(서버 운영)와 권한 연관성이 낮습니다.",
                                 "신청자: 인사팀 (서버 운영 담당)", "사용 기간: 기한 없음", "권한 신청 1차 결재함에서 승인 또는 반려"]
    # 이름 · 신청 사유는 넣지 않음
    assert "김혜정" not in text and "급여 정산" not in text
    late = notify.waiting_alert({**REQ, "stage": "top", "ai_verdict": None, "period_end": "2026-12-31"})
    assert alert_text(late).splitlines() == ["최종 결재 대기 - 급여 테이블 조회", "결재 대기 · REQ-20261115-001",
                                             "신청자: 인사팀 (서버 운영 담당)", "사용 기간: 2026-12-31", "권한 신청 최종 결재함에서 승인 또는 반려"]
    failed = notify.waiting_alert({**REQ, "ai_verdict": {"level": None, "reason": "", "failed": True}})
    assert failed.summary is None and notify.waiting_alert({**REQ, "stage": "approved"}) is None


def test_waiting_watcher_sends_after_ai_verdict(main_db, people, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send_slack", lambda url, alert: sent.append(alert))
    for code in "ABC":
        catalog.create(main_db, people["top"], code, f"권한{code}")
    old = permissions.submit(main_db, people["user"], "A", "업무")["request_no"]   # 웹이 뜨기 전 신청이지만 판정을 기다리는 중
    watcher = notify.WaitingWatcher(notify.Chat(slack="http://hook"), main_db)

    judged = permissions.submit(main_db, people["user"], "B", "업무")["request_no"]
    gone = permissions.submit(main_db, people["user"], "C", "업무")["request_no"]
    assert watcher.check() == []   # AI 판정이 아직 없음
    permissions.save_ai_verdict(main_db, judged, {"level": "위험", "reason": "직무와 무관합니다. 반려를 권합니다.", "failed": False}, "m")
    permissions.withdraw(main_db, people["user"], gone)
    [text] = watcher.check()
    assert text.splitlines()[:3] == ["1차 결재 대기 - 권한B", f"결재 대기 · {judged}", "AI 사전 검토: 위험 — 직무와 무관합니다."]
    assert watcher.check() == [] and len(sent) == 1   # 철회한 신청은 알리지 않고, 같은 신청을 다시 알리지 않음

    # 판정이 끝까지 안 오면 AI 줄 없이 보냄 — 다시 띄웠을 때 기다리던 신청을 이어서 봄
    restarted = notify.WaitingWatcher(notify.Chat(slack="http://hook"), main_db)
    assert restarted.pending and restarted.check() == []
    restarted.wait = 0
    [late] = restarted.check()
    assert late.splitlines()[:3] == ["1차 결재 대기 - 권한A", f"결재 대기 · {old}", "신청자: 인사팀"]


def test_watcher_starts_with_teams_only(results_db):
    watcher = notify.RiskWatcher(notify.Chat(teams="http://hook"), results_db, every=3600)
    watcher.start()
    assert watcher._thread is not None
    watcher.stop()
