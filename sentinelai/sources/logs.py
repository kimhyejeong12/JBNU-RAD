"""보안 솔루션 로그 (Microsoft Sentinel 내보내기) — 구조체 · 컬럼 · 읽기 · 자르기 · 찾기 · 세기 · 행동 신호."""
from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from typing import Any

from .base import Columns, ColumnMapper, LoadResult, Record, Row, load, parse_datetime


class SecurityEvent(Record):
    """솔루션마다 다른 컬럼은 attributes 에 담습니다."""

    solution: str
    occurred_at: datetime  # UTC
    who: str = ""
    where: str = ""
    how: str = ""
    user_id: str = ""
    user_name: str = ""
    department: str = ""
    source_ip: str = ""
    tenant_id: str = ""
    attributes: dict[str, str] = {}

    @property
    def log_user(self) -> str:
        """사용자별로 묶는 키 — ID 가 없는 내보내기는 행위자 이름입니다."""
        return self.user_id or self.who

    def describe(self) -> str:
        """프롬프트에 넣을 한 줄 요약."""
        line = (
            f"- {self.occurred_at:%Y-%m-%d %H:%M:%S} UTC [{self.solution}] "
            f"{self.department} {self.who}({self.source_ip or 'IP 없음'}) — {self.where} / {self.how}"
        )
        if self.attributes:
            line += " / " + ", ".join(f"{k}={v}" for k, v in self.attributes.items())
        return line


# 판정에 쓰지 않는 Log Analytics 공통 컬럼은 attributes 에 넣지 않습니다.
_IGNORED = {"_ResourceId", "SourceSystem", "MG", "ManagementGroupName", "Computer"}


class EventMapper(ColumnMapper):
    """Microsoft Sentinel 사용자 지정 로그 → SecurityEvent. WHO · WHERE · HOW 를 공통 컬럼으로 봅니다."""

    COLUMNS = {
        "occurred_at": ["TimeGenerated [UTC]", "TimeGenerated"],
        "solution": ["Type"],
        "who": ["WHO"],
        "where": ["WHERE"],
        "how": ["HOW"],
        "user_id": ["UserID", "UserId"],
        "user_name": ["UserName"],
        "department": ["UserGroup"],
        "source_ip": ["SourceIP", "SourceIp"],
        "tenant_id": ["TenantId"],
    }
    REQUIRED = frozenset({"occurred_at", "solution"})

    def __init__(self, columns: Columns | None = None, solution: str | None = None) -> None:
        """solution: Type 컬럼이 없는 파일에 쓸 솔루션 이름."""
        super().__init__(columns)
        self.solution = solution
        if solution:
            self.required.discard("solution")

    def map(self, row: Row) -> SecurityEvent:
        skip = self.known_columns() | _IGNORED
        return SecurityEvent(
            solution=self.solution or self.get(row, "solution").removesuffix("_CL"),
            occurred_at=parse_datetime(self.get(row, "occurred_at")),
            who=self.get(row, "who"),
            where=self.get(row, "where"),
            how=self.get(row, "how"),
            user_id=self.get(row, "user_id"),
            user_name=self.get(row, "user_name"),
            department=self.get(row, "department"),
            source_ip=self.get(row, "source_ip"),
            tenant_id=self.get(row, "tenant_id"),
            attributes={k: v for k, v in row.items() if k not in skip},
            raw=row,
        )


def load_events(
    target: Any,
    mapper: EventMapper | None = None,
    strict: bool = False,
    since: datetime | None = None,
    until: datetime | None = None,
) -> LoadResult:
    """범위 밖 로그는 오류가 아니므로 issues 에 넣지 않습니다."""
    result = load(target, mapper or EventMapper(), strict)
    if since or until:
        result.records = between(result.records, since, until)
    return result


# 지금부터 거슬러 올라가는 길이입니다 (달력 단위 아님).
PERIODS = {"day": timedelta(days=1), "week": timedelta(days=7), "month": timedelta(days=30), "quarter": timedelta(days=90),
           "half": timedelta(days=180), "year": timedelta(days=365), "all": None}


def _utc(moment: datetime) -> datetime:
    # occurred_at 은 UTC 라서 시간대 없는 값과는 비교할 수 없습니다.
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment


def period_since(period: str, now: datetime) -> datetime | None:
    """지금부터 PERIODS 만큼 전 시각. all 이면 None."""
    if period not in PERIODS:
        raise ValueError(f"기간은 {' · '.join(PERIODS)} 중 하나입니다: {period}")
    length = PERIODS[period]
    return _utc(now) - length if length else None


def user_label(e: SecurityEvent) -> str:
    """"부서 이름" — 로그 조회는 이 값이 같은 로그만 고릅니다."""
    return f"{e.department} {e.who or e.user_name}".strip()


def between(
    events: Iterable[SecurityEvent],
    since: datetime | None = None,
    until: datetime | None = None,
    include_since: bool = False,
) -> list[SecurityEvent]:
    """since 초과 ~ until 이하 (include_since 면 since 포함). 시간대 없는 값은 UTC 로 봅니다."""
    since = _utc(since) if since else None
    until = _utc(until) if until else None

    def after(e: SecurityEvent) -> bool:
        return since is None or (e.occurred_at >= since if include_since else e.occurred_at > since)

    return [e for e in events if after(e) and (until is None or e.occurred_at <= until)]


def latest(events: Iterable[SecurityEvent]) -> datetime | None:
    """다음 실행에 since 로 넘길 시각."""
    return max((e.occurred_at for e in events), default=None)


def group_by_user(events: Iterable[SecurityEvent]) -> dict[str, list[SecurityEvent]]:
    """사용자별로 시간순 묶음."""
    groups: dict[str, list[SecurityEvent]] = {}
    for e in sorted(events, key=lambda e: e.occurred_at):
        groups.setdefault(e.log_user, []).append(e)
    return groups


def _has(value: str, needle: str) -> bool:
    return needle.casefold() in value.casefold()


def search(
    events: Iterable[SecurityEvent],
    user: str = "",
    department: str = "",
    solution: str = "",
    where: str = "",
    how: str = "",
    keyword: str = "",
) -> list[SecurityEvent]:
    """조건마다 부분 일치(대소문자 무시). keyword 가 "항목=값"이면 그 값이 같아야 합니다."""
    key, _, wanted = keyword.partition("=") if "=" in keyword else ("", "", "")

    def attr_ok(e: SecurityEvent) -> bool:
        if key:
            return any(k.casefold() == key.strip().casefold() and v.strip() == wanted.strip() for k, v in e.attributes.items())
        return any(_has(f"{k}={v}", keyword) for k, v in e.attributes.items())

    def ok(e: SecurityEvent) -> bool:
        return (
            (not user or any(_has(v, user) for v in (e.who, e.user_name, e.user_id, f"{e.department} {e.who}")))
            and (not department or _has(e.department, department))
            and (not solution or _has(e.solution, solution))
            and (not where or _has(e.where, where))
            and (not how or _has(e.how, how))
            and (not keyword or attr_ok(e))
        )

    return sorted((e for e in events if ok(e)), key=lambda e: e.occurred_at)


def number(value: str) -> float | None:
    try:
        return float(value.replace(",", ""))
    except ValueError:
        return None


def summarize(events: list[SecurityEvent]) -> dict:
    """질의 답변의 숫자는 모두 여기서 나옵니다."""
    totals: dict[str, float] = {}
    for e in events:
        for k, v in e.attributes.items():
            n = number(v)
            if n is not None:
                totals[k] = totals.get(k, 0) + n
    count = lambda key: dict(Counter(key(e) for e in events).most_common())  # noqa: E731
    return {
        "count": len(events),
        "first": events[0].occurred_at.isoformat() if events else None,
        "last": events[-1].occurred_at.isoformat() if events else None,
        "by_user": count(user_label),
        "by_solution": count(lambda e: e.solution),
        "by_how": count(lambda e: e.how),
        "by_day": count(lambda e: e.occurred_at.date().isoformat()),
        # 숫자로 읽히는 항목만 더합니다. 0/1 항목은 해당 건수가 됩니다.
        "attribute_totals": {k: int(v) if v.is_integer() else v for k, v in totals.items()},
    }


def vocabulary(events: list[SecurityEvent]) -> dict:
    """질문의 표현을 로그 표기에 맞추도록 모델에게 보여줄 실제 값."""
    distinct = lambda key: sorted({key(e) for e in events if key(e)})  # noqa: E731
    return {
        "users": distinct(user_label),
        "departments": distinct(lambda e: e.department),
        "solutions": distinct(lambda e: e.solution),
        "where": distinct(lambda e: e.where),
        "how": distinct(lambda e: e.how),
        "attributes": sorted({k for e in events for k in e.attributes}),
        "first": min(e.occurred_at for e in events).isoformat() if events else None,
        "last": max(e.occurred_at for e in events).isoformat() if events else None,
    }


# --- 행동 신호 · 위협 표시 (사용자별로 평소와 다른 행동을 코드가 셈) ---

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
    total = sum(n for e in events for k, v in e.attributes.items() if k.lower() != "exception" and (n := number(v)) is not None)
    return total or len(events)


def behavior_signals(events: list[SecurityEvent], now: datetime | None = None) -> dict[str, dict[str, Any]]:
    """최근 RECENT 를 그 앞 BASELINE 과 견줍니다. → {log_id: {subject, 신호들, highlights}}"""
    now = now or datetime.now(timezone.utc)
    recent_from, base_from = now - RECENT, now - RECENT - BASELINE
    by_user: dict[str, list[SecurityEvent]] = defaultdict(list)
    for e in sorted(events, key=lambda e: e.occurred_at):
        by_user[e.log_user].append(e)

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


def signals_text(s: dict[str, Any] | None) -> str:
    """행동 신호 → 프롬프트용 글."""
    if s is None:
        return "로그 없음 (권한 신청 기록만 있음)"
    ratio = f"{s['volume_ratio']}배" if s["volume_ratio"] is not None else "평소 기록 없음"
    rows = [f"- 최근 7일 로그 {s['recent_events']}건 · 평소 4주 {s['baseline_events']}건",
            f"- 하루 양(출력 장수 등) 평소 {s['baseline_daily_volume']} → 최근 {s['recent_daily_volume']} ({ratio})",
            f"- 근무 시간 밖 · 주말 {round(s['off_hours_ratio'] * 100)}% · 예외 승인 {round(s['exception_ratio'] * 100)}%",
            f"- 민감 문서 {s['sensitive_events']}건 ({', '.join(s['sensitive_words']) or '없음'}) · 30분 안 최대 {s['max_burst_30min']}건",
            f"- 첫 로그 {s['first_seen'][:10]} · 마지막 로그 {s['last_seen'][:10]}{' (처음 보는 계정)' if s['new_account'] else ''}"]
    return "\n".join(rows + [f"- 눈에 띔: {h}" for h in s["highlights"]])


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
