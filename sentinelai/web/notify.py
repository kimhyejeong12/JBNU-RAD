"""알림 — 결재할 신청은 결재자 Slack 채널로, 결재 결과는 신청자 본인에게 메일로 보냅니다.

- Slack: 새 신청 → 1차 결재 대기, 1차 승인 → 최종 결재 대기. 채널에는 결재자만 있다고 보고 결과(승인 · 반려)는 올리지 않습니다.
- 메일: 1차 반려 · 최종 승인 · 최종 반려를 신청자 계정의 이메일(users.email)로. 이메일이 비어 있으면 보내지 않습니다.

설정은 SENTINELAI_SLACK_WEBHOOK_URL · SENTINELAI_SMTP_* (비우면 그 알림을 끔). 엔진 설정(Settings)에 없는 칸이라 같은 곳(.env · 환경변수)에서 따로 읽습니다.
"""
from __future__ import annotations

import json
import logging
import smtplib
import ssl
import urllib.request
from dataclasses import dataclass
from email.message import EmailMessage

from sentinelai.db import Database, auth
from sentinelai.engine.engine import BOOT_ENV, Settings

log = logging.getLogger(__name__)

KEY = "SENTINELAI_SLACK_WEBHOOK_URL"


def _env(key: str) -> str:
    return (BOOT_ENV.get(key) or Settings._from_file().get(key, "")).strip()


def slack_url() -> str:
    return _env(KEY)


#: 결재 단계 → 알림 머리말 · 결재함. 이 단계로 막 넘어온 신청만 알립니다.
WAITING = {"manager": ("1차 결재 대기", "1차 결재함"), "top": ("최종 결재 대기", "최종 결재함")}


def waiting_message(req: dict) -> str | None:
    """결재할 차례가 된 신청의 알림 문장. 결재 대기가 아니면(반려 · 승인 · 철회) None."""
    if req["stage"] not in WAITING:
        return None
    head, inbox = WAITING[req["stage"]]
    # 바깥 서비스로 나가므로 신청 사유 · 이름은 넣지 않습니다. 자세한 내용은 결재함에서 봅니다.
    return (f"[{head}] {req['request_no']} — {req['requester_department']} · {req['requested_access']}\n"
            f"SentinelAI 권한 신청 {inbox}에서 확인하세요")


def notify_waiting(url: str, req: dict) -> None:
    text = waiting_message(req)
    if text:
        send_slack(url, text)


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


# --- 메일 (결재 결과 → 신청자) -------------------------------------------------


@dataclass(frozen=True)
class Mail:
    host: str
    port: int
    user: str
    password: str
    sender: str

    @property
    def on(self) -> bool:
        return bool(self.host and self.sender)


def mail_settings() -> Mail:
    """SENTINELAI_SMTP_HOST 가 비면 메일을 끕니다. 보내는 주소(FROM)가 비면 로그인 계정을 씁니다."""
    host, user = _env("SENTINELAI_SMTP_HOST"), _env("SENTINELAI_SMTP_USER")
    port = _env("SENTINELAI_SMTP_PORT")
    return Mail(host=host, port=int(port) if port else 587, user=user, password=_env("SENTINELAI_SMTP_PASSWORD"),
                sender=_env("SENTINELAI_SMTP_FROM") or user)


def result_message(req: dict) -> tuple[str, str] | None:
    """결재가 끝난 신청의 (제목, 본문). 끝나지 않았으면 None."""
    if req["stage"] == "approved":
        result = "승인"
    elif req["stage"] == "rejected":
        result = "1차 결재에서 반려" if any(a["step"] == "manager" and a["action"] == "reject" for a in req["approvals"]) else "최종 결재에서 반려"
    else:
        return None
    # 사내 밖 메일 서버를 거칠 수 있으므로 반려 의견 · 신청 사유는 넣지 않습니다. 자세한 내용은 화면에서 봅니다.
    return (f"[SentinelAI] 권한 신청 {req['request_no']} {'승인' if result == '승인' else '반려'}",
            f"신청하신 권한이 {result}되었습니다.\n\n"
            f"신청 번호: {req['request_no']}\n권한: {req['requested_access']}\n\n"
            "자세한 내용(결재 의견 등)은 SentinelAI 내 신청에서 확인하세요.\n"
            "이 메일은 보내기 전용입니다.")


def notify_result(mail: Mail, db: Database, req: dict) -> None:
    """결재 응답을 보낸 뒤 백그라운드에서 부릅니다."""
    message = result_message(req)
    if not message or not mail.on:
        return
    to = auth.email_of(db, req["requester_id"])
    if to:
        send_mail(mail, to, *message)


def send_mail(mail: Mail, to: str, subject: str, body: str) -> None:
    """실패해도 결재는 이미 저장됐으므로 로그만 남깁니다. 465 는 처음부터 TLS, 그 밖은 STARTTLS 를 지원하면 씁니다."""
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, mail.sender, to
    msg.set_content(body)
    context = ssl.create_default_context()
    try:
        if mail.port == 465:
            server: smtplib.SMTP = smtplib.SMTP_SSL(mail.host, mail.port, timeout=10, context=context)
        else:
            server = smtplib.SMTP(mail.host, mail.port, timeout=10)
        with server:
            secure = mail.port == 465
            server.ehlo_or_helo_if_needed()
            if not secure and server.has_extn("starttls"):
                server.starttls(context=context)
                secure = True
            if mail.user:
                # 암호화하지 않은 연결로 비밀번호를 보내지 않습니다.
                if not secure:
                    raise smtplib.SMTPException("TLS 를 지원하지 않는 서버라 로그인하지 않았습니다")
                server.login(mail.user, mail.password)
            server.send_message(msg)
    except Exception as exc:  # noqa: BLE001
        log.warning("결재 결과 메일을 보내지 못했습니다 (%s): %s", to, exc)
