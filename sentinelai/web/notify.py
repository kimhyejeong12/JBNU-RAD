"""알림 — 결재할 신청 · 로그 감시 위험 · 예외 상황은 운영자 Slack 으로, 결재 결과는 신청자 메일로 보냅니다 (설정이 비면 끔)."""
from __future__ import annotations

import json
import logging
import smtplib
import ssl
import threading
import urllib.request
from dataclasses import dataclass
from email.message import EmailMessage

from sentinelai.db import Database, auth, results, watch
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
    why = ""
    if req["stage"] == "approved":
        head, first = "승인", "신청하신 권한이 승인되었습니다."
    elif req["stage"] == "rejected":
        rejected = next(a for a in req["approvals"] if a["action"] == "reject")
        head, first = "반려", f"신청하신 권한이 {'1차' if rejected['step'] == 'manager' else '최종'} 결재에서 반려되었습니다."
        why = f"반려 의견: {rejected['comment'] or '(적지 않음)'}\n"
    elif req["stage"] == "revoked":
        head, first = "회수", "승인됐던 권한이 회수되었습니다."
        why = f"회수 사유: {req['revocation']['reason']}\n"
    else:
        return None
    # 반려 의견 · 회수 사유는 다시 신청하거나 알아보는 데 필요해 넣고, 신청 사유 · 결재자 · AI 판정은 넣지 않습니다.
    return (f"[SentinelAI] 권한 신청 {req['request_no']} {head}",
            f"{first}\n\n"
            f"신청 번호: {req['request_no']}\n권한: {req['requested_access']}\n{why}\n"
            "자세한 내용은 SentinelAI 내 신청에서 확인하세요.\n"
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


class Poller:
    """check() 를 주기마다 돌리는 스레드입니다. Slack 주소가 없으면 띄우지 않습니다."""

    name = "poller"

    def __init__(self, url: str, every: float = RISK_POLL_SEC) -> None:
        self.url, self.every = url, every
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def check(self) -> list[str]:
        raise NotImplementedError

    def _run(self) -> None:
        while not self._stop.wait(self.every):
            try:
                self.check()
            except Exception as exc:  # noqa: BLE001
                log.warning("%s 알림을 확인하지 못했습니다: %s", self.name, exc)

    def start(self) -> None:
        if self.url:
            self._thread = threading.Thread(target=self._run, name=self.name, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)


class RiskWatcher(Poller):
    """새 위험 판정을 주기마다 읽어 알립니다. 엔진을 건드리지 않으려고 결과 DB 를 지켜봅니다."""

    name = "로그 감시 위험"

    def __init__(self, url: str, db: Database, every: float = RISK_POLL_SEC) -> None:
        super().__init__(url, every)
        self.db = db
        # 웹이 뜨기 전 판정은 알리지 않습니다 (다시 띄울 때마다 예전 위험이 다시 가지 않게).
        self.after = results.last_finding_id(db)
        self.alerted: list[dict] = []

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


# --- 예외 상황 → 운영자 Slack 채널 ---------------------------------------------------

ROLE_TEXT = {"user": "일반 사용자", "manager": "보안 운영자", "top": "보안 총책임자"}
SETTING_TEXT = {"regulation_upload": "기준 문서 올림", "regulation_edit": "기준 문서 고침", "regulation_remove": "기준 문서 지움",
                "access_create": "권한 목록 추가", "access_update": "권한 목록 고침", "node_key_issue": "수집 노드 키 다시 발급",
                "jobs_reset": "작업 강제 중지", "queue_clear": "작업 큐 초기화"}


def exception_message(head: str, lines: list[str], where: str = "") -> str:
    # 바깥 서비스로 나가므로 사람 이름 · 로그인 아이디는 넣지 않습니다.
    return (f"[{head}] {len(lines)}건\n" + "".join(f"- {line}\n" for line in lines)
            + f"SentinelAI{' ' + where if where else ''}에서 확인하세요")


def account_changes(before: dict[int, tuple[str, bool]], after: dict[int, tuple[str, bool]]) -> list[str]:
    """역할이 바뀌거나 정지 · 다시 켠 계정, 새로 만든 보안 운영자 · 보안 총책임자 계정."""
    lines = []
    for uid, (role, active) in after.items():
        if uid not in before:
            if role != "user":
                lines.append(f"{ROLE_TEXT[role]} 계정 만듦")
            continue
        old_role, old_active = before[uid]
        if role != old_role:
            lines.append(f"{ROLE_TEXT[old_role]} → {ROLE_TEXT[role]}")
        if active != old_active:
            lines.append(f"{ROLE_TEXT[role]} 계정 {'다시 켬' if active else '정지'}")
    return lines


def setting_line(row: dict) -> str:
    if row["action"] == "node_update":
        return f"수집 노드 {'켬' if row['detail'].get('enabled') else '끔'}: {row['target_id']}"
    if row["action"] in ("jobs_reset", "queue_clear"):
        return SETTING_TEXT[row["action"]]
    return f"{SETTING_TEXT[row['action']]}: {row['target_id']}"


class ExceptionWatcher(Poller):
    """권한 DB 의 감사 기록 · 보유 권한 재검토 · 계정 상태를 주기마다 읽어 예외 상황을 알립니다. 웹이 뜨기 전 일은 알리지 않습니다."""

    name = "예외 상황"

    def __init__(self, url: str, db: Database, every: float = RISK_POLL_SEC) -> None:
        super().__init__(url, every)
        self.db = db
        self.audit_after, self.grant_after = watch.cursor(db)
        self.accounts = watch.accounts(db)
        self.gone = watch.gone_holders(db)

    def check(self) -> list[str]:
        """보낸 문장들 — 계정 역할 변경 · 보유 권한 위험 · AI 위험인데 승인 · 보안 설정 변경 순."""
        accounts = watch.accounts(self.db)
        account_lines = account_changes(self.accounts, accounts)
        self.accounts = accounts

        grant_lines = []
        grants = watch.risky_grants_after(self.db, self.grant_after)
        if grants:
            self.grant_after = grants[-1]["id"]
        grant_lines += [f"이동 뒤 재검토 위험: {g['request_no']} — {g['requested_access']}" for g in grants]
        # 퇴사일은 날이 바뀌며 지나므로 이벤트가 없어 계정 목록을 견줍니다.
        gone = watch.gone_holders(self.db)
        grant_lines += [f"퇴사일이 지난 계정에 권한 {n}건 남음" for uid, n in gone.items() if uid not in self.gone]
        self.gone = gone

        rows = watch.audit_after(self.db, self.audit_after)
        if rows:
            self.audit_after = rows[-1]["id"]
        risky = [r["target_id"] for r in rows if r["action"] == "request_approve"
                 and r["detail"].get("step") == "top" and r["detail"].get("ai_level") == "위험"]
        reqs = watch.requests_by_no(self.db, risky)
        approve_lines = [f"{no} — {reqs[no]['requester_department']} · {reqs[no]['requested_access']}" for no in risky if no in reqs]
        setting_lines = [setting_line(r) for r in rows if r["action"] != "request_approve"]

        texts = [exception_message(head, lines, where) for head, lines, where in (
            ("계정 역할 변경", account_lines, "관리의 계정 관리"),
            ("보유 권한 위험", grant_lines, "권한 신청의 확인할 사람"),
            ("AI 위험 판정 승인", approve_lines, "권한 신청"),
            ("보안 설정 변경", setting_lines, ""),
        ) if lines]
        for text in texts:
            send_slack(self.url, text)
        return texts
