"""알림 카드 — 같은 알림이 글 · Slack · Teams · 메일에서 같은 순서로 그려지고, 이스케이프 · 목록 자르기 · 이름 가리기 · 색을 봅니다."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sentinelai.web import notify
from sentinelai.web.alert_cards import Alert, alert_text, mail_html, slack_payload, teams_payload

RISK = Alert(title="로그 감시 위험 - 출력행위 31줄, 메일발송 4줄", tone="risk", badge="위험", ref="판정 #123 · 1차 판정",
             summary=("AI 분석 요약", "근무 시간 밖에 민감 문서를 대량 출력했습니다."),
             facts=(("발생 대상", "영업"), ("발생 위치", "PC, VDI")), at="2026-11-18T21:35:00+09:00", todo="로그 감시에서 판정을 확인하고 결정")
LINE = "- 2026-11-18 12:{m:02d}:00 UTC [SecureMark] 영업 최지훈(1.1.1.5) — {where} / {how}{more}"


def test_text_reads_core_first():
    # 첫 줄(알림 미리보기)만 봐도 무슨 일인지
    assert alert_text(RISK).splitlines() == [
        "로그 감시 위험 - 출력행위 31줄, 메일발송 4줄", "위험 · 판정 #123 · 1차 판정",
        "AI 분석 요약: 근무 시간 밖에 민감 문서를 대량 출력했습니다.", "발생 대상: 영업", "발생 위치: PC, VDI",
        "로그 감시에서 판정을 확인하고 결정"]


def test_slack_card():
    payload = slack_payload(RISK)
    [card] = payload["attachments"]
    top, title, summary, facts, todo = card["blocks"]
    # 왼쪽 색 줄이 급한 정도
    assert payload["text"] == alert_text(RISK) and card["color"] == "#EA002C"
    assert top["elements"][0]["text"] == "*위험* · 판정 #123 · 1차 판정"
    assert title["text"]["text"] == "*로그 감시 위험 - 출력행위 31줄, 메일발송 4줄*"
    assert summary["text"]["text"] == "*AI 분석 요약*\n> 근무 시간 밖에 민감 문서를 대량 출력했습니다."
    at = int(datetime(2026, 11, 18, 12, 35, tzinfo=timezone.utc).timestamp())
    # 발생 시각은 보는 사람의 시간대로 — 서버(UTC) 시각을 글자로 박지 않음
    assert [f["text"] for f in facts["fields"]] == ["*발생 대상*\n영업", "*발생 위치*\nPC, VDI",
                                                    f"*발생 시각*\n<!date^{at}^{{date_num}} {{time}}|2026-11-18 12:35 UTC>"]
    assert todo["elements"][0]["text"] == "로그 감시에서 판정을 확인하고 결정"


def test_teams_card():
    card = teams_payload(RISK)["attachments"][0]["content"]
    top, title, summary, row1, row2, todo = card["body"]
    badge, ref = (c["items"][0] for c in top["columns"])
    assert (badge["text"], badge["color"], ref["text"]) == ("위험", "attention", "판정 #123 · 1차 판정")
    assert title["text"] == "로그 감시 위험 - 출력행위 31줄, 메일발송 4줄" and title["weight"] == "Bolder"
    assert summary["style"] == "attention" and [i["text"] for i in summary["items"]] == ["AI 분석 요약", "근무 시간 밖에 민감 문서를 대량 출력했습니다."]
    # 항목은 2단
    assert [[i["text"] for i in c["items"]] for c in row1["columns"]] == [["발생 대상", "영업"], ["발생 위치", "PC, VDI"]]
    assert [[i["text"] for i in c["items"]] for c in row2["columns"]] == [
        ["발생 시각", "{{DATE(2026-11-18T12:35:00Z, COMPACT)}} {{TIME(2026-11-18T12:35:00Z)}}"]]
    assert todo["text"] == "로그 감시에서 판정을 확인하고 결정"


def test_same_order_without_summary():
    # AI 문장이 없는 알림은 그 상자만 빠지고 순서는 같음
    alert = notify.exception_alert("계정 역할 변경", ["일반 사용자 → 보안 운영자"], "관리의 계정 관리에서 변경 이력 확인", "warn")
    assert alert_text(alert).splitlines() == ["계정 역할 변경 1건", "주의", "- 일반 사용자 → 보안 운영자", "관리의 계정 관리에서 변경 이력 확인"]
    top, title, items, todo = slack_payload(alert)["attachments"][0]["blocks"]
    assert (top["elements"][0]["text"], title["text"]["text"], items["text"]["text"]) == ("*주의*", "*계정 역할 변경 1건*", "• 일반 사용자 → 보안 운영자")


def test_long_list_is_cut():
    alert = Alert(title="보안 설정 변경 7건", badge="기록", tone="plain", items=tuple(f"줄 {n}" for n in range(7)))
    assert alert_text(alert).splitlines()[2:] == ["- 줄 0", "- 줄 1", "- 줄 2", "- 줄 3", "- 줄 4", "- 외 2건"]
    assert slack_payload(alert)["attachments"][0]["blocks"][2]["text"]["text"].endswith("• 줄 4\n• 외 2건")
    assert len(teams_payload(alert)["attachments"][0]["content"]["body"][2]["items"]) == 6


def test_values_are_escaped():
    alert = Alert(title="보안 설정 변경 1건", items=("기준 문서 업로드: <!channel>&.md",), summary=("반려 의견", "<script>x</script>\n둘째 줄"))
    slack = json.dumps(slack_payload(alert), ensure_ascii=False)
    # 문서 · 권한 이름으로 채널 전체를 호출하지 못하게
    assert "<!channel>" not in slack and "&lt;!channel&gt;&amp;.md" in slack
    page = mail_html(alert)
    assert "<script>" not in page and "&lt;script&gt;x&lt;/script&gt;<br>둘째 줄" in page


def test_mail_html_has_no_outside_address():
    req = {"stage": "rejected", "request_no": "REQ-20261118-003", "requested_access": "급여 테이블 조회",
           "approvals": [{"action": "reject", "step": "manager", "comment": "업무 범위 밖"}]}
    subject, alert = notify.result_alert(req)
    page = mail_html(alert)
    assert subject == "[SentinelAI] 권한 신청 REQ-20261118-003 반려"
    assert "http" not in page and "<img" not in page and "<link" not in page
    # 윗줄(배지 · 번호) → 제목 → 반려 의견 → 권한
    assert page.index("REQ-20261118-003") < page.index("반려되었습니다") < page.index("업무 범위 밖") < page.index("급여 테이블 조회")
    # 결과 메일은 급한 일이 아니라 회색 줄 (색은 위험 · 주의에만)
    assert "border-left:4px solid #C4C4C9" in page and "#EA002C" not in page


def test_log_tally_counts_actions_and_places_only():
    lines = "\n".join([LINE.format(m=n, where="PC", how="출력행위", more=" / Attachments=급여.xlsx, PrintCount=3") for n in range(3)]
                      + [LINE.format(m=10 + n, where="VDI", how="메일발송", more="") for n in range(2)]
                      + [LINE.format(m=20, where="PC", how="매체반출", more=" / n=1"), LINE.format(m=21, where="서버", how="화면캡처", more="")])
    acts, places = notify.log_tally(lines)
    assert (acts, places) == ("출력행위 3줄, 메일발송 2줄, 매체반출 1줄, 외 1종", "PC, VDI")
    # 이름 · 파일 이름은 넣지 않음
    assert "최지훈" not in acts and "급여" not in acts
    assert notify.log_tally("- 로그") == ("", "")


def test_first_sentence_and_mask():
    reason = "**위험 요인**: 사용자 최지훈의 근무 시간 밖 출력이 평소의 4배입니다. 추가 확인이 필요합니다."
    one = notify.first_sentence(reason)
    assert one == "사용자 최지훈의 근무 시간 밖 출력이 평소의 4배입니다."
    assert notify.mask(one, ["영업 최지훈", "최지훈", "4"], "해당 사용자") == "해당 사용자의 근무 시간 밖 출력이 평소의 4배입니다."
    assert notify.first_sentence("- 첫 줄입니다\n- 둘째 줄") == "첫 줄입니다"
    # 조사도 맞춤, 숫자뿐인 ID 는 건수와 헷갈려 건드리지 않음
    assert notify.mask("최지훈은 12건을 출력했고 최지훈과 김수영을 봄", ["최지훈", "12"], "해당 사용자") == "해당 사용자는 12건을 출력했고 해당 사용자와 김수영을 봄"
    assert notify.mask("김혜정의 직무와 맞지 않음", ["김혜정"], "신청자") == "신청자의 직무와 맞지 않음"
    assert len(notify.first_sentence("가" * 300)) == 140 and notify.first_sentence("") == ""


def test_risk_alert_is_one_card_per_finding():
    row = {"id": 7, "stage": "final", "user": "4", "subject": "영업 최지훈", "last_event_at": "2026-11-18T12:35:00+00:00",
           "events": LINE.format(m=30, where="PC", how="출력행위", more=""), "reason": "최지훈이 고객 명단을 대량 출력했습니다."}
    alert = notify.risk_alert(row)
    text = alert_text(alert)
    assert text.splitlines() == ["로그 감시 위험 - 출력행위 1줄", "위험 · 판정 #7 · 확정", "AI 분석 요약: 해당 사용자가 고객 명단을 대량 출력했습니다.",
                                 "발생 대상: 영업", "발생 위치: PC", "로그 감시에서 판정을 확인하고 결정"]
    assert "최지훈" not in text and alert.at == "2026-11-18T12:35:00+00:00"
    # 로그 줄 · 이유를 못 읽어도 카드는 감
    bare = notify.risk_alert({"id": 8, "stage": "fast", "user": "x", "subject": "", "last_event_at": "2026-11-18T12:35:00+00:00", "events": "- 로그", "reason": ""})
    assert alert_text(bare).splitlines() == ["로그 감시 위험", "위험 · 판정 #8 · 1차 판정", "발생 대상: 부서 미상", "로그 감시에서 판정을 확인하고 결정"]


def test_color_only_for_risk_and_caution():
    from sentinelai.web.alert_cards import TONES
    assert set(TONES) == {"risk", "warn", "plain"}
    assert slack_payload(RISK)["attachments"][0]["color"] == "#EA002C"
    for alert in (notify.waiting_alert({"stage": "manager", "request_no": "R", "requester_department": "인사팀", "requested_access": "A"}),
                  notify.exception_alert("보안 설정 변경", ["x"], "확인", "plain")):
        assert alert.tone == "plain" and slack_payload(alert)["attachments"][0]["color"] == "#C4C4C9"
