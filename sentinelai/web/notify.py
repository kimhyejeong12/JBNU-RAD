"""알림 — 결재할 신청 · 로그 감시 위험은 운영자 Slack 으로, 결재 결과는 신청자 메일로 보냅니다 (설정이 비면 끔)."""
from __future__ import annotations

import json
import logging
import smtplib
import ssl
import threading
import urllib.request
from dataclasses import dataclass
from email.message import EmailMessage

from sentinelai.db import Database, auth, results
from sentinelai.engine.settings import BOOT_ENV, Settings

log = logging.getLogger(__name__)

KEY = "SENTINELAI_SLACK_WEBHOOK_URL"


def _env(key: str) -> str:
    return (BOOT_ENV.get(key) or Settings._from_file().get(key, "")).strip()


def slack_url() -> str:
    return _env(KEY)


#: 결재 단계 → 알림 머리말 · 결재함.
WAITING = {"manager": ("1차 결재 대기", "1차 결재함"), "top": ("최종 결재 대기", "최종 결재함")}


def waiting_message(req: dict) -> str | None:
    """결재 대기가 아니면 None 입니다."""
    if req["stage"] not in WAITING:
        return None
    head, inbox = WAITING[req["stage"]]
    # 바깥 서비스로 나가므로 신청 사유 · 이름은 넣지 않습니다.
    return (f"[{head}] {req['request_no']} — {req['requester_department']} · {req['requested_access']}\n"
            f"SentinelAI 권한 신청 {inbox}에서 확인하세요")


def notify_waiting(url: str, req: dict) -> None:
    text = waiting_message(req)
    if text:
        send_slack(url, text)


def send_slack(url: str, text: str) -> None:
    """실패해도 신청은 이미 저장됐으므로 로그만 남깁니다."""
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
    """SMTP_HOST 가 비면 메일을 끄고, FROM 이 비면 로그인 계정을 씁니다."""
    host, user = _env("SENTINELAI_SMTP_HOST"), _env("SENTINELAI_SMTP_USER")
    port = _env("SENTINELAI_SMTP_PORT")
    return Mail(host=host, port=int(port) if port else 587, user=user, password=_env("SENTINELAI_SMTP_PASSWORD"),
                sender=_env("SENTINELAI_SMTP_FROM") or user)


def result_message(req: dict) -> tuple[str, str] | None:
    """(제목, 본문). 결재가 끝나거나 회수된 것이 아니면 None 입니다."""
    if req["stage"] == "approved":
        head, first = "승인", "신청하신 권한이 승인되었습니다."
    elif req["stage"] == "rejected":
        step = "1차" if any(a["step"] == "manager" and a["action"] == "reject" for a in req["approvals"]) else "최종"
        head, first = "반려", f"신청하신 권한이 {step} 결재에서 반려되었습니다."
    elif req["stage"] == "revoked":
        head, first = "회수", "승인됐던 권한이 회수되었습니다."
    else:
        return None
    # 사내 밖 메일 서버를 거칠 수 있으므로 반려 의견 · 회수 사유 · 신청 사유는 넣지 않습니다.
    return (f"[SentinelAI] 권한 신청 {req['request_no']} {head}",
            f"{first}\n\n"
            f"신청 번호: {req['request_no']}\n권한: {req['requested_access']}\n\n"
            "자세한 내용(결재 의견, 회수 사유 등)은 SentinelAI 내 신청에서 확인하세요.\n"
            "이 메일은 보내기 전용입니다.")


def notify_result(mail: Mail, db: Database, req: dict) -> None:
    message = result_message(req)
    if not message or not mail.on:
        return
    to = auth.email_of(db, req["requester_id"])
    if to:
        send_mail(mail, to, *message)


def send_mail(mail: Mail, to: str, subject: str, body: str) -> None:
    """실패해도 결재는 이미 저장됐으므로 로그만 남깁니다."""
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


# --- 로그 감시 위험 → 운영자 Slack 채널 ---------------------------------------------

RISK_POLL_SEC = 30
STAGE_TEXT = {"fast": "1차 판정", "final": "확정"}


def risk_message(stage: str, count: int) -> str:
    # 바깥 서비스로 나가므로 사람 · 로그 내용은 넣지 않습니다.
    return f"[로그 감시 위험 · {STAGE_TEXT[stage]}] {count}건\nSentinelAI 로그 감시에서 확인하세요"


def _same(a: dict, b: dict) -> bool:
    return a["user"] == b["user"] and a["first_event_at"] <= b["last_event_at"] and b["first_event_at"] <= a["last_event_at"]


class RiskWatcher:
    """새 위험 판정을 주기마다 읽어 알립니다. 엔진을 건드리지 않으려고 결과 DB 를 지켜봅니다."""

    def __init__(self, url: str, db: Database, every: float = RISK_POLL_SEC) -> None:
        self.url, self.db, self.every = url, db, every
        # 웹이 뜨기 전 판정은 알리지 않습니다 (다시 띄울 때마다 예전 위험이 다시 가지 않게).
        self.after = results.last_finding_id(db)
        self.alerted: list[dict] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def check(self) -> list[str]:
        """보낸 문장들. 확정은 1차 때 알린 사람 · 로그 구간과 겹치면 넘깁니다."""
        rows = results.findings_after(self.db, self.after)
        if not rows:
            return []
        self.after = rows[-1]["id"]
        fast = [r for r in rows if r["stage"] == "fast"]
        final = [r for r in rows if r["stage"] == "final" and not any(_same(r, a) for a in self.alerted)]
        self.alerted = (self.alerted + fast)[-500:]
        texts = [risk_message(stage, len(group)) for stage, group in (("fast", fast), ("final", final)) if group]
        for text in texts:
            send_slack(self.url, text)
        return texts

    def _run(self) -> None:
        while not self._stop.wait(self.every):
            try:
                self.check()
            except Exception as exc:  # noqa: BLE001
                log.warning("로그 감시 위험 알림을 확인하지 못했습니다: %s", exc)

    def start(self) -> None:
        if self.url:
            self._thread = threading.Thread(target=self._run, name="risk-watcher", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
