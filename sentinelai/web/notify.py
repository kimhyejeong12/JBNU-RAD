"""운영자 알림 — 새 권한 신청을 Slack 채널로 보냅니다.

주소는 SENTINELAI_SLACK_WEBHOOK_URL (비우면 보내지 않음). 엔진 설정(Settings)에 없는 칸이라 같은 곳(.env · 환경변수)에서 따로 읽습니다.
"""
from __future__ import annotations

import json
import logging
import urllib.request

from sentinelai.engine.engine import BOOT_ENV, Settings

log = logging.getLogger(__name__)

KEY = "SENTINELAI_SLACK_WEBHOOK_URL"


def slack_url() -> str:
    return BOOT_ENV.get(KEY) or Settings._from_file().get(KEY, "")


def request_message(req: dict) -> str:
    # 바깥 서비스로 나가므로 신청 사유 · 이름은 넣지 않습니다. 자세한 내용은 결재함에서 봅니다.
    return (f"새 권한 신청 {req['request_no']} — {req['requester_department']} · {req['requested_access']}\n"
            "SentinelAI 권한 신청 결재함에서 확인하세요")


def send_slack(url: str, text: str) -> None:
    """응답을 보낸 뒤 백그라운드에서 부릅니다. 실패해도 신청은 이미 저장됐으므로 로그만 남깁니다."""
    if not url:
        return
    body = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except Exception as exc:  # noqa: BLE001
        log.warning("Slack 알림을 보내지 못했습니다: %s", exc)
