"""알림 — 결재할 신청 · 로그 감시 위험 · 예외 상황은 운영자 Slack · Teams 채널로, 결재 결과는 신청자 메일로 보냅니다 (설정이 비면 끔). 모양은 alert_cards.py."""
from __future__ import annotations

import json
import logging
import re
import smtplib
import ssl
import threading
import urllib.request
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from sentinelai.db import Database, auth, watch
from sentinelai.engine.settings import BOOT_ENV, Settings
from sentinelai.web.alert_cards import Alert, alert_text, mail_html, slack_payload, teams_payload

log = logging.getLogger(__name__)

def _env(key: str) -> str:
    return (BOOT_ENV.get(key) or Settings._from_file().get(key, "")).strip()


@dataclass(frozen=True)
class Chat:
    """운영자 채널 — 웹훅 주소가 빈 쪽은 보내지 않습니다."""

    slack: str = ""
    teams: str = ""

    @property
    def on(self) -> bool:
        return bool(self.slack or self.teams)


def chat_settings() -> Chat:
    return Chat(slack=_env("SENTINELAI_SLACK_WEBHOOK_URL"), teams=_env("SENTINELAI_TEAMS_WEBHOOK_URL"))


#: 결재 단계 → 알림 머리말 · 결재함.
WAITING = {"manager": ("1차 결재 대기", "1차 결재함"), "top": ("최종 결재 대기", "최종 결재함")}


def first_sentence(text: str, limit: int = 140) -> str:
    """AI 이유의 첫 문장 — 글머리표 · 굵게 표시 · 소제목을 걷고 한 문장만, 길면 자릅니다."""
    line = next((x.strip() for x in text.splitlines() if x.strip()), "")
    line = re.sub(r"^(?:\d+[.)]|[-•*])\s+", "", line).replace("**", "")
    # 모델이 단 소제목("위험 요인: …")은 빼고 내용만
    line = re.sub(r"^[^:：.]{2,30}[:：]\s+", "", line)
    line = re.split(r"(?<=[.!?])\s+", line, maxsplit=1)[0]
    return line if len(line) <= limit else line[:limit - 1].rstrip() + "…"


_JOSA = {"이": "가", "은": "는", "을": "를", "과": "와", "으로": "로"}


def mask(text: str, names: list[str], word: str) -> str:
    """사람을 가리키는 말을 가립니다 — 채널이 바깥 서비스라 이름은 내보내지 않습니다. 숫자뿐인 ID 는 건수와 헷갈려 건드리지 않습니다."""
    # 가린 말은 모음으로 끝나므로 바로 뒤 조사도 맞춤 (최지훈이 → 해당 사용자가)
    swap = lambda m: word + _JOSA.get(m.group(1) or "", "")  # noqa: E731
    for name in sorted({n.strip() for n in names if len(n.strip()) >= 2 and not n.strip().isdigit()}, key=len, reverse=True):
        text = re.sub(rf"(?:{word}\s*|사용자\s*)?{re.escape(name)}(?:(으로|이|은|을|과)(?![가-힣]))?", swap, text)
    return text


def period_text(req: dict) -> str:
    start, end = req.get("period_start") or "", req.get("period_end") or ""
    return f"{start} ~ {end}".strip(" ~") if end else "기한 없음"


def waiting_alert(req: dict) -> Alert | None:
    """결재 대기가 아니면 None 입니다. AI 판정이 있으면 등급과 이유 한 문장을 붙입니다."""
    if req["stage"] not in WAITING:
        return None
    head, inbox = WAITING[req["stage"]]
    # 바깥 서비스로 나가므로 이름 · 신청 사유는 넣지 않고 부서 · 직무만 넣습니다.
    who = (req.get("requester_department") or "부서 없음") + (f" ({req['requester_job']})" if req.get("requester_job") else "")
    verdict, summary = req.get("ai_verdict"), None
    if verdict and not verdict.get("failed") and verdict.get("level"):
        why = mask(first_sentence(verdict.get("reason") or ""), [req.get("requester_name") or ""], "신청자")
        summary = ("AI 사전 검토", f"{verdict['level']} — {why}" if why else verdict["level"])
    return Alert(title=f"{head} - {req['requested_access']}", tone="plain", badge="결재 대기", ref=req["request_no"],
                 summary=summary, facts=(("신청자", who), ("사용 기간", period_text(req))),
                 todo=f"권한 신청 {inbox}에서 승인 또는 반려")


def notify_waiting(chat: Chat, req: dict) -> None:
    alert = waiting_alert(req)
    if alert:
        send_chat(chat, alert)


def send_chat(chat: Chat, alert: Alert) -> None:
    """같은 알림을 켜 둔 채널마다 그 채널의 카드 모양으로 보냅니다."""
    if chat.slack:
        send_slack(chat.slack, alert)
    if chat.teams:
        send_teams(chat.teams, alert)


def _post(url: str, payload: dict, name: str) -> None:
    """실패해도 신청 · 결재 · 판정은 이미 저장됐으므로 로그만 남깁니다."""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except Exception as exc:  # noqa: BLE001
        log.warning("%s 알림을 보내지 못했습니다: %s", name, exc)


def send_slack(url: str, alert: Alert) -> None:
    _post(url, slack_payload(alert), "Slack")


def send_teams(url: str, alert: Alert) -> None:
    _post(url, teams_payload(alert), "Teams")


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


def result_alert(req: dict) -> tuple[str, Alert] | None:
    """(제목, 알림). 결재가 끝나거나 회수된 것이 아니면 None 입니다."""
    summary = None
    if req["stage"] == "approved":
        head, first, tone = "승인", "신청하신 권한이 승인되었습니다.", "plain"
    elif req["stage"] == "rejected":
        rejected = next(a for a in req["approvals"] if a["action"] == "reject")
        head, first, tone = "반려", f"신청하신 권한이 {'1차' if rejected['step'] == 'manager' else '최종'} 결재에서 반려되었습니다.", "plain"
        summary = ("반려 의견", rejected["comment"] or "(미입력)")
    elif req["stage"] == "revoked":
        head, first, tone = "회수", "승인됐던 권한이 회수되었습니다.", "plain"
        summary = ("회수 사유", req["revocation"]["reason"])
    else:
        return None
    # 반려 의견 · 회수 사유는 신청자가 가장 먼저 찾는 것이라 제목 바로 아래에 두고, 신청 사유 · 결재자 · AI 판정은 넣지 않습니다.
    return (f"[SentinelAI] 권한 신청 {req['request_no']} {head}",
            Alert(title=first, tone=tone, badge=head, ref=req["request_no"], summary=summary, facts=(("권한", req["requested_access"]),),
                  note="자세한 내용은 SentinelAI 내 신청에서 확인하세요.\n이 메일은 보내기 전용입니다."))


def notify_result(mail: Mail, db: Database, req: dict) -> None:
    message = result_alert(req)
    if not message or not mail.on:
        return
    to = auth.email_of(db, req["requester_id"])
    if to:
        send_mail(mail, to, *message)


def send_mail(mail: Mail, to: str, subject: str, alert: Alert) -> None:
    """글과 HTML 을 함께 보냅니다 (HTML 을 못 보는 메일 프로그램은 글). 실패해도 결재는 이미 저장됐으므로 로그만 남깁니다."""
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, mail.sender, to
    msg.set_content(alert_text(alert))
    msg.add_alternative(mail_html(alert), subtype="html")
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


# --- 로그 감시 위험 → 운영자 채널 ---------------------------------------------------

RISK_POLL_SEC = 30
STAGE_TEXT = {"fast": "1차 판정", "final": "확정"}
#: 판정에 묶인 로그 한 줄의 위치 · 행위 — "…) — 어디서 / 행위 / 항목" (sources.logs 의 SecurityEvent.describe 모양)
_LOG = re.compile(r"\) — (.*?) / ([^/\n]+?)(?: / |$)")


def log_tally(text: str) -> tuple[str, str]:
    """(행위 요약, 위치 요약) — 행위는 많은 것 셋과 줄 수, 위치는 많은 것 둘. 이름 · 파일 이름 없이 무슨 일인지만, 못 읽으면 빈 글입니다."""
    found = [m for line in text.splitlines() if (m := _LOG.search(line))]
    acts, places = Counter(m.group(2).strip() for m in found), Counter(m.group(1).strip() for m in found)
    rest = len(acts) - 3
    return (", ".join(f"{act} {n}줄" for act, n in acts.most_common(3)) + (f", 외 {rest}종" if rest > 0 else ""),
            ", ".join(place for place, _ in places.most_common(2)))


def risk_alert(row: dict) -> Alert:
    """위험 판정 한 건 = 카드 한 장 — 제목에 무슨 행위인지, 바로 아래 AI 이유 한 문장."""
    acts, places = log_tally(row.get("events") or "")
    subject = (row.get("subject") or "").strip()
    # 바깥 서비스로 나가므로 부서만 넣고 이름은 넣지 않습니다 (subject = "부서 이름").
    department = subject.rsplit(" ", 1)[0] if " " in subject else ""
    why = mask(first_sentence(row.get("reason") or ""), [subject, subject.rsplit(" ", 1)[-1], row.get("user") or ""], "해당 사용자")
    facts = (("발생 대상", department or "부서 미상"),) + ((("발생 위치", places),) if places else ())
    return Alert(title="로그 감시 위험" + (f" - {acts}" if acts else ""), tone="risk", badge="위험",
                 ref=f"판정 #{row['id']} · {STAGE_TEXT[row['stage']]}", summary=("AI 분석 요약", why) if why else None,
                 facts=facts, at=row["last_event_at"], todo="로그 감시에서 판정을 확인하고 결정")


def _same(a: dict, b: dict) -> bool:
    return a["user"] == b["user"] and a["first_event_at"] <= b["last_event_at"] and b["first_event_at"] <= a["last_event_at"]


class Poller:
    """check() 를 주기마다 돌리는 스레드입니다. 채널이 하나도 없으면 띄우지 않습니다."""

    name = "poller"

    def __init__(self, chat: Chat, every: float = RISK_POLL_SEC) -> None:
        self.chat, self.every = chat, every
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
        if self.chat.on:
            self._thread = threading.Thread(target=self._run, name=self.name, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)


class RiskWatcher(Poller):
    """새 위험 판정을 주기마다 읽어 알립니다. 엔진을 건드리지 않으려고 결과 DB 를 지켜봅니다."""

    name = "로그 감시 위험"

    def __init__(self, chat: Chat, db: Database, every: float = RISK_POLL_SEC) -> None:
        super().__init__(chat, every)
        self.db = db
        # 웹이 뜨기 전 판정은 알리지 않습니다 (다시 띄울 때마다 예전 위험이 다시 가지 않게).
        self.after = watch.last_finding_id(db)
        self.alerted: list[dict] = []

    def check(self) -> list[str]:
        """보낸 문장들. 확정은 1차 때 알린 사람 · 로그 구간과 겹치면 넘깁니다."""
        rows = watch.findings_after(self.db, self.after)
        if not rows:
            return []
        self.after = rows[-1]["id"]
        fast = [r for r in rows if r["stage"] == "fast"]
        final = [r for r in rows if r["stage"] == "final" and not any(_same(r, a) for a in self.alerted)]
        self.alerted = (self.alerted + fast)[-500:]
        alerts = [risk_alert(row) for row in sorted(fast + final, key=lambda r: r["id"])]
        for alert in alerts:
            send_chat(self.chat, alert)
        return [alert_text(a) for a in alerts]


# --- 1차 결재 대기 → 운영자 채널 (AI 판정이 끝난 뒤) --------------------------------

WAIT_AI_SEC = 180


def _age_sec(iso: str) -> float:
    at = datetime.fromisoformat(iso)
    return (datetime.now(timezone.utc) - (at if at.tzinfo else at.replace(tzinfo=timezone.utc))).total_seconds()


class WaitingWatcher(Poller):
    """새 신청의 AI 판정이 저장되면 1차 결재 대기를 알립니다 (AI 사전 검토 한 줄을 함께 보내려고). 판정이 늦으면 AI 줄 없이 보냅니다."""

    name = "결재 대기"

    def __init__(self, chat: Chat, db: Database, every: float = RISK_POLL_SEC, wait: float = WAIT_AI_SEC) -> None:
        super().__init__(chat, every)
        self.db, self.wait = db, wait
        self.after = watch.last_request_id(db)
        # 다시 띄웠을 때 판정을 기다리던 신청은 이어서 지켜봅니다 (그보다 오래된 것은 이미 알렸음).
        since = (datetime.now(timezone.utc) - timedelta(seconds=wait)).isoformat(timespec="seconds")
        self.pending: set[int] = set(watch.unjudged_request_ids(db, since))

    def check(self) -> list[str]:
        """보낸 문장들. 그 사이 철회 · 결재된 신청은 넘깁니다 (최종 결재 대기는 결재할 때 따로 보냄)."""
        new = watch.request_ids_after(self.db, self.after)
        if new:
            self.after = new[-1]
        self.pending.update(new)
        alerts = []
        for row in watch.waiting_requests(self.db, sorted(self.pending)):
            waiting = row["stage"] == "manager"
            if waiting and row["ai_verdict"] is None and _age_sec(row["submitted_at"]) < self.wait:
                continue
            self.pending.discard(row["id"])
            if waiting:
                alerts.append(waiting_alert(row))
        for alert in alerts:
            send_chat(self.chat, alert)
        return [alert_text(a) for a in alerts]


# --- 예외 상황 → 운영자 채널 ---------------------------------------------------------

ROLE_TEXT = {"user": "일반 사용자", "manager": "보안 운영자", "top": "보안 총책임자"}
SETTING_TEXT = {"regulation_upload": "기준 문서 업로드", "regulation_edit": "기준 문서 수정", "regulation_remove": "기준 문서 삭제",
                "access_create": "권한 목록 추가", "access_update": "권한 목록 수정", "node_key_issue": "수집 노드 키 재발급",
                "jobs_reset": "작업 강제 중지", "queue_clear": "작업 큐 초기화"}


#: 급한 정도 → 배지.
TAG = {"risk": "위험", "warn": "주의", "plain": "기록"}


def exception_alert(head: str, lines: list[str], todo: str, tone: str) -> Alert:
    # 바깥 서비스로 나가므로 사람 이름 · 로그인 아이디는 넣지 않습니다.
    return Alert(title=f"{head} {len(lines)}건", tone=tone, badge=TAG[tone], items=tuple(lines), todo=todo)


def account_changes(before: dict[int, tuple[str, bool]], after: dict[int, tuple[str, bool]]) -> list[str]:
    """역할이 바뀌거나 정지 · 다시 켠 계정, 새로 만든 보안 운영자 · 보안 총책임자 계정."""
    lines = []
    for uid, (role, active) in after.items():
        if uid not in before:
            if role != "user":
                lines.append(f"{ROLE_TEXT[role]} 계정 생성")
            continue
        old_role, old_active = before[uid]
        if role != old_role:
            lines.append(f"{ROLE_TEXT[old_role]} → {ROLE_TEXT[role]}")
        if active != old_active:
            lines.append(f"{ROLE_TEXT[role]} 계정 {'재활성' if active else '정지'}")
    return lines


def setting_line(row: dict) -> str:
    if row["action"] == "node_update":
        return f"수집 노드 {'활성' if row['detail'].get('enabled') else '비활성'}: {row['target_id']}"
    if row["action"] in ("jobs_reset", "queue_clear"):
        return SETTING_TEXT[row["action"]]
    return f"{SETTING_TEXT[row['action']]}: {row['target_id']}"


class ExceptionWatcher(Poller):
    """권한 DB 의 감사 기록 · 보유 권한 재검토 · 계정 상태를 주기마다 읽어 예외 상황을 알립니다. 웹이 뜨기 전 일은 알리지 않습니다."""

    name = "예외 상황"

    def __init__(self, chat: Chat, db: Database, every: float = RISK_POLL_SEC) -> None:
        super().__init__(chat, every)
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
        grant_lines += [f"이동 후 재검토 위험: {g['request_no']} — {g['requested_access']}" for g in grants]
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
        approve_lines = [f"{no} — {reqs[no]['requester_department']}, {reqs[no]['requested_access']}" for no in risky if no in reqs]
        setting_lines = [setting_line(r) for r in rows if r["action"] != "request_approve"]

        alerts = [exception_alert(head, lines, todo, tone) for head, lines, todo, tone in (
            ("계정 역할 변경", account_lines, "관리의 계정 관리에서 변경 이력 확인", "warn"),
            ("보유 권한", grant_lines, "보안 현황의 권한 변동에서 확인하고 회수 여부 결정", "risk"),
            ("AI 위험 판정 승인", approve_lines, "권한 신청에서 승인 근거 확인", "risk"),
            ("보안 설정 변경", setting_lines, "의도한 변경인지 확인", "plain"),
        ) if lines]
        for alert in alerts:
            send_chat(self.chat, alert)
        return [alert_text(a) for a in alerts]
