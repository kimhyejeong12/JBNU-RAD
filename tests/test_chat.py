from __future__ import annotations

from sentinelai.web import notify

TEXT = "[계정 역할 변경] 1건\n- 일반 사용자 → 보안 운영자\nSentinelAI 관리의 계정 관리에서 확인하세요"


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "_post", lambda url, payload, name: sent.append((name, url, payload)))
    return sent


def test_same_text_to_each_channel(monkeypatch):
    sent = _capture(monkeypatch)
    notify.send_chat(notify.Chat(slack="https://slack.example/hook", teams="https://teams.example/hook"), TEXT)
    (slack_name, slack_url, slack), (teams_name, teams_url, teams) = sent
    assert (slack_name, slack_url, slack) == ("Slack", "https://slack.example/hook", {"text": TEXT})
    assert (teams_name, teams_url) == ("Teams", "https://teams.example/hook")
    [attachment] = teams["attachments"]
    assert teams["type"] == "message" and attachment["contentType"] == "application/vnd.microsoft.card.adaptive"
    blocks = attachment["content"]["body"]
    assert "\n".join(b["text"] for b in blocks) == TEXT
    assert blocks[0]["weight"] == "Bolder" and all("weight" not in b for b in blocks[1:])


def test_only_configured_channels(monkeypatch):
    sent = _capture(monkeypatch)
    notify.send_chat(notify.Chat(teams="https://teams.example/hook"), TEXT)
    notify.send_chat(notify.Chat(), TEXT)
    assert [name for name, _, _ in sent] == ["Teams"]
    assert not notify.Chat().on and notify.Chat(teams="x").on


def test_waiting_goes_to_teams(monkeypatch):
    sent = _capture(monkeypatch)
    req = {"stage": "manager", "request_no": "REQ-20261115-001", "requester_department": "인사팀", "requested_access": "급여 테이블 조회"}
    notify.notify_waiting(notify.Chat(teams="https://teams.example/hook"), req)
    [(_, _, payload)] = sent
    assert payload["attachments"][0]["content"]["body"][0]["text"] == "[1차 결재 대기] REQ-20261115-001 — 인사팀, 급여 테이블 조회"


def test_watcher_starts_with_teams_only(results_db):
    watcher = notify.RiskWatcher(notify.Chat(teams="http://hook"), results_db, every=3600)
    watcher.start()
    assert watcher._thread is not None
    watcher.stop()
