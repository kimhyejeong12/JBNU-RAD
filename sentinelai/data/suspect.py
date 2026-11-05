"""의심 점수의 행동 신호 — 사용자별로 평소와 다른 행동을 코드가 셉니다."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from .events import _number, user_label
from .types import SecurityEvent

RECENT = timedelta(days=7)
BASELINE = timedelta(days=28)
NEW_ACCOUNT = timedelta(days=7)  # 처음 로그가 이보다 최근이면 처음 보는 계정입니다.
BURST = timedelta(minutes=30)
# 업무 시간은 KST 평일 8시~19시입니다.
WORK_HOURS = range(8, 19)
SENSITIVE = ("급여", "인사", "개인정보", "주민", "계약", "고객", "설계", "소스", "기밀", "salary", "hr_", "contract", "customer")
EXCEPTION_KEYS = ("exception", "예외")


def _off_hours(e: SecurityEvent) -> bool:
    local = e.occurred_at.astimezone()
    return local.weekday() >= 5 or local.hour not in WORK_HOURS


def _exception(e: SecurityEvent) -> bool:
    return any(k.lower().startswith(EXCEPTION_KEYS) and str(v).strip() in ("1", "true", "True", "Y", "예") for k, v in e.attributes.items())


def _sensitive(e: SecurityEvent) -> list[str]:
    text = " ".join(str(v) for v in e.attributes.values()).lower()
    return [w for w in SENSITIVE if w.lower() in text]


def _volume(events: list[SecurityEvent]) -> float:
    """숫자 칸(출력 장수 등)이 있으면 그 합, 없으면 건수."""
    total = sum(n for e in events for k, v in e.attributes.items() if k.lower() != "exception" and (n := _number(v)) is not None)
    return total or len(events)


def behavior_signals(events: list[SecurityEvent], now: datetime | None = None) -> dict[str, dict[str, Any]]:
    """최근 RECENT 를 그 앞 BASELINE 과 견줍니다. → {log_id: {subject, 신호들, highlights}}"""
    now = now or datetime.now(timezone.utc)
    recent_from, base_from = now - RECENT, now - RECENT - BASELINE
    by_user: dict[str, list[SecurityEvent]] = defaultdict(list)
    for e in sorted(events, key=lambda e: e.occurred_at):
        by_user[e.user_id or e.who].append(e)

    out = {}
    for uid, evs in by_user.items():
        recent = [e for e in evs if e.occurred_at >= recent_from]
        base = [e for e in evs if base_from <= e.occurred_at < recent_from]
        base_daily = _volume(base) / (BASELINE.days) if base else 0.0
        recent_daily = _volume(recent) / RECENT.days if recent else 0.0
        burst = 0
        for i, e in enumerate(recent):
            burst = max(burst, sum(1 for x in recent[i:] if x.occurred_at - e.occurred_at <= BURST))
        sensitive = sorted({w for e in recent for w in _sensitive(e)})
        first = evs[0].occurred_at
        signals = {
            "subject": user_label(evs[-1]),
            "first_seen": first.isoformat(), "last_seen": evs[-1].occurred_at.isoformat(),
            "recent_events": len(recent), "baseline_events": len(base),
            "recent_daily_volume": round(recent_daily, 1), "baseline_daily_volume": round(base_daily, 1),
            # 평소가 없으면 늘어난 비율을 셀 수 없어 None 입니다.
            "volume_ratio": round(recent_daily / base_daily, 1) if base_daily else None,
            "off_hours_ratio": round(sum(map(_off_hours, recent)) / len(recent), 2) if recent else 0.0,
            "exception_ratio": round(sum(map(_exception, recent)) / len(recent), 2) if recent else 0.0,
            "sensitive_events": sum(1 for e in recent if _sensitive(e)), "sensitive_words": sensitive,
            "max_burst_30min": burst,
            "new_account": now - first <= NEW_ACCOUNT,
        }
        signals["highlights"] = _highlights(signals)
        out[uid] = signals
    return out


def _highlights(s: dict[str, Any]) -> list[str]:
    h = []
    if s["new_account"]:
        h.append("처음 보는 계정 (첫 로그가 7일 안)")
    if s["volume_ratio"] is not None and s["volume_ratio"] >= 2:
        h.append(f"최근 7일 하루 양이 평소의 {s['volume_ratio']}배 ({s['baseline_daily_volume']} → {s['recent_daily_volume']})")
    if s["recent_events"] and s["off_hours_ratio"] >= 0.3:
        h.append(f"근무 시간 밖 · 주말 활동 {round(s['off_hours_ratio'] * 100)}%")
    if s["recent_events"] and s["exception_ratio"] >= 0.3:
        h.append(f"예외 승인 {round(s['exception_ratio'] * 100)}%")
    if s["sensitive_events"]:
        h.append(f"민감 문서 {s['sensitive_events']}건 ({', '.join(s['sensitive_words'])})")
    if s["max_burst_30min"] >= 5:
        h.append(f"30분 안에 {s['max_burst_30min']}건 몰아서")
    return h


THREAT_LIMIT = 15


def threat_marks(e: SecurityEvent) -> list[str]:
    """코드가 정하는 사실(예외 승인 · 민감 문서 · 근무 시간 밖)만 붙입니다."""
    marks = ["예외 승인"] if _exception(e) else []
    if words := _sensitive(e):
        marks.append(f"민감 문서({', '.join(words)})")
    if _off_hours(e):
        marks.append("근무 시간 밖")
    return marks


def threat_lines(events: list[SecurityEvent], limit: int = THREAT_LIMIT) -> list[str]:
    """한 종류가 몰리지 않게 종류마다 최근 것부터 돌아가며 limit 줄을 뽑아 시간순으로 돌려줍니다."""
    kinds: dict[tuple, list[tuple[SecurityEvent, list[str]]]] = defaultdict(list)
    for e in sorted(events, key=lambda e: e.occurred_at, reverse=True):
        if marks := threat_marks(e):
            kinds[(e.solution, e.how, tuple(m.split("(")[0] for m in marks))].append((e, marks))
    picked: list[tuple[SecurityEvent, list[str]]] = []
    queues = sorted(kinds.values(), key=lambda q: q[0][0].occurred_at, reverse=True)
    while len(picked) < limit and any(queues):
        for q in queues:
            if q and len(picked) < limit:
                picked.append(q.pop(0))
    return [f"{e.describe()} [{' · '.join(m)}]" for e, m in sorted(picked, key=lambda x: x[0].occurred_at)]


BANDS = ((70, "높음"), (40, "보통"))


def band(score: int) -> str:
    """모델이 적은 등급 대신 점수로 정해 둘이 어긋나지 않게 합니다."""
    return next((name for floor, name in BANDS if score >= floor), "낮음")


def suspect_people(accounts: list[dict[str, Any]], signals: dict[str, dict[str, Any]], findings: list[dict[str, Any]],
                   requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """계정과 로그 사용자는 log_id 로 잇고, 잇지 못한 로그 사용자는 "계정 미연결"로 둡니다."""
    people: dict[str, dict[str, Any]] = {}
    by_log: dict[str, str] = {}
    by_account: dict[int, str] = {}

    def person(key: str, **info: Any) -> dict[str, Any]:
        return people.setdefault(key, {"key": key, **info, "signals": None, "findings": [], "requests": []})

    # 일반 사용자와 로그 사용자 ID 를 적은 계정만 사람으로 둡니다.
    for a in accounts:
        if a["role"] != "user" and not a["log_id"]:
            continue
        key = f"account:{a['id']}"
        person(key, name=a["display_name"], department=a["department"], login_id=a["login_id"], log_id=a["log_id"], linked=bool(a["log_id"]))
        by_account[a["id"]] = key
        if a["log_id"]:
            by_log[a["log_id"]] = key
    for log_id, s in signals.items():
        key = by_log.get(log_id) or f"log:{log_id}"
        person(key, name=s["subject"], department="", login_id=None, log_id=log_id, linked=False)["signals"] = s
    for f in findings:
        key = by_log.get(f["log_id"]) or f"log:{f['log_id']}"
        person(key, name=f["subject"], department="", login_id=None, log_id=f["log_id"], linked=False)["findings"].append(f)
    for r in requests:
        if r["account_id"] in by_account:
            people[by_account[r["account_id"]]]["requests"].append(r)
    return list(people.values())
