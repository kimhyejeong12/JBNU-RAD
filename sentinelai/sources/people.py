"""사람 — 계정 · 이동 · 지금 가진 권한 · 신청 기록(권한 DB) · 로그 · 행동 신호 · 운영자 결정을 사람마다 모읍니다. 예전 AI 등급 · 의심 점수는 모으지 않습니다."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from ..db import Database, auth, permissions
from . import decisions
from .logs import SecurityEvent, behavior_signals, group_by_user

NOT_WRITTEN = "적지 않음"


def requester_text(row: dict[str, Any], department: str | None = None) -> str:
    """신청 행의 "부서 이름". department 를 주면 그 부서로 (이동 뒤 재검토)."""
    dept = row.get("requester_department", "") if department is None else department
    return f"{dept} {row['requester_name']}".strip()


def access_text(row: dict[str, Any]) -> str:
    """분류(급여정보 등)가 조항 검색과 판정의 실마리라 권한 목록 정보를 붙입니다."""
    lines = [f"{row['requested_access']} ({row['access_code']})" if row.get("access_code") else row["requested_access"]]
    for label, key in (("시스템", "access_system"), ("분류", "access_category"), ("설명", "access_description")):
        if row.get(key):
            lines.append(f"{label}: {row[key]}")
    return "\n".join(lines)


def reason_text(row: dict[str, Any]) -> str:
    return (row.get("reason") or "").strip() or NOT_WRITTEN


def move_text(move: dict[str, Any]) -> str:
    side = lambda d, j: f"{d or '부서 없음'}({j or '직무 없음'})"  # noqa: E731
    return f"{move['moved_on']} {side(move['from_department'], move['from_job'])} → {side(move['to_department'], move['to_job'])}"


@dataclass
class Person:
    """account = permissions.account_record (없으면 계정과 잇지 않은 로그 사용자), decided = 로그 감시 판정에 운영자가 정한 것."""

    account: dict[str, Any] | None
    log_id: str
    events: list[SecurityEvent]
    signals: dict[str, Any] | None
    decided: list[dict[str, Any]]


class People:
    """작업 한 번에 쓸 사람 자료 — 로그 · 계정 · 운영자 결정은 한 번만 읽습니다."""

    def __init__(self, main_db: Database, results_db: Database, events: list[SecurityEvent], now: datetime | None = None) -> None:
        self.main_db = main_db
        self.now = now or datetime.now(timezone.utc)
        self.events = events
        self.by_log = group_by_user(events)
        self.accounts = auth.accounts_brief(main_db)
        self.signals = behavior_signals(events, self.now)
        self.decided = decisions.events(main_db, results_db)

    def account_of(self, log_id: str) -> int | None:
        return next((a["id"] for a in self.accounts if log_id and a["log_id"] == log_id), None)

    def get(self, account_id: int | None = None, log_id: str = "", before: str | None = None) -> Person:
        """before 가 있으면 그때까지의 이동 · 신청 · 로그 · 결정만 봅니다 (신청 판정)."""
        if account_id is None and log_id:
            account_id = self.account_of(log_id)
        account = permissions.account_record(self.main_db, account_id, before) if account_id is not None else None
        log_id = log_id or (account or {}).get("log_id") or ""
        mine = self.by_log.get(log_id, []) if log_id else []
        signals = self.signals.get(log_id) if log_id else None
        decided = self.decided.get(log_id, [])
        if before:
            cut = datetime.fromisoformat(before)
            cut = cut.replace(tzinfo=timezone.utc) if cut.tzinfo is None else cut
            mine = [e for e in mine if e.occurred_at <= cut]
            signals = behavior_signals(mine, cut).get(log_id) if mine else None
            decided = [d for d in decided if d["decided_at"] <= before]
        return Person(account, log_id, mine, signals, sorted(decided, key=lambda d: (d["decided_at"], d["at"])))

    def suspects(self, findings: list[dict[str, Any]], requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """위협 예측 대상 — 계정과 로그 사용자는 log_id 로 잇고, 잇지 못한 로그 사용자는 "계정 미연결"로 둡니다."""
        people: dict[str, dict[str, Any]] = {}
        by_log: dict[str, str] = {}
        by_account: dict[int, str] = {}

        def person(key: str, **info: Any) -> dict[str, Any]:
            return people.setdefault(key, {"key": key, **info, "signals": None, "findings": [], "requests": []})

        # 일반 사용자와 로그 사용자 ID 를 적은 계정만 사람으로 둡니다.
        for a in self.accounts:
            if a["role"] != "user" and not a["log_id"]:
                continue
            key = f"account:{a['id']}"
            person(key, name=a["display_name"], department=a["department"], login_id=a["login_id"], log_id=a["log_id"],
                   linked=bool(a["log_id"]), account_id=a["id"])
            by_account[a["id"]] = key
            if a["log_id"]:
                by_log[a["log_id"]] = key
        for log_id, s in self.signals.items():
            key = by_log.get(log_id) or f"log:{log_id}"
            person(key, name=s["subject"], department="", login_id=None, log_id=log_id, linked=False, account_id=None)["signals"] = s
        # 아래 둘은 화면의 기록 칸(로그 위험 · 주의 수 등)에만 쓰고 모델에는 넣지 않습니다.
        for f in findings:
            key = by_log.get(f["log_id"]) or f"log:{f['log_id']}"
            person(key, name=f["subject"], department="", login_id=None, log_id=f["log_id"], linked=False, account_id=None)["findings"].append(f)
        for r in requests:
            if r["account_id"] in by_account:
                people[by_account[r["account_id"]]]["requests"].append(r)
        return list(people.values())
