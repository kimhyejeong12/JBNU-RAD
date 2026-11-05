"""DLP 로그 (Microsoft Sentinel 내보내기) — 읽기(CSV · TSV · JSON · JSONL, 파일 또는 폴더) · 구조체 · 자르기 · 찾기 · 세기 · 행동 신호."""
from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from .. import ROOT

Row = dict[str, str]


class SecurityEvent(BaseModel):
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


@dataclass
class LoadIssue:
    line: int
    message: str

    def __str__(self) -> str:
        # 0행은 파일 전체의 문제입니다.
        return f"{self.line}행: {self.message}" if self.line else self.message


@dataclass
class LoadResult:
    source: str
    records: list[SecurityEvent] = field(default_factory=list)
    # 한 행이 깨져도 나머지는 쓸 수 있게 예외 대신 모아 둡니다.
    issues: list[LoadIssue] = field(default_factory=list)


# --- 시각 ---

# 한국어 로캘로 내보낸 CSV 는 "2026. 10. 6. 오전 2:47:00.000" 처럼 적힙니다.
_KO_DATETIME = re.compile(
    r"^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$"
)


def parse_datetime(value: str) -> datetime:
    """한국어 로캘 표기 또는 ISO 8601 → UTC datetime."""
    m = _KO_DATETIME.match(value)
    if m:
        y, mo, d, ampm, h, mi, s, frac = m.groups()
        hour = int(h) % 12 + (12 if ampm == "오후" else 0)
        micro = int((frac or "0").ljust(6, "0"))
        parsed = datetime(int(y), int(mo), int(d), hour, int(mi), int(s or 0), micro)
    else:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError(f"날짜 · 시각 형식이 아닙니다: {value!r}") from None
    # TimeGenerated 는 UTC 라서 시간대 표기가 없으면 UTC 로 봅니다.
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


# --- 컬럼 ---

# 판정에 쓰지 않는 Log Analytics 공통 컬럼은 attributes 에 넣지 않습니다.
_IGNORED = {"_ResourceId", "SourceSystem", "MG", "ManagementGroupName", "Computer"}


class EventMapper:
    """Microsoft Sentinel 사용자 지정 로그 → SecurityEvent. 필드마다 후보 컬럼 이름을 앞에서부터 찾고, WHO · WHERE · HOW 를 공통 컬럼으로 봅니다."""

    COLUMNS: dict[str, Sequence[str]] = {
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

    def __init__(self, columns: Mapping[str, Sequence[str]] | None = None, solution: str | None = None) -> None:
        """columns: 이름이 다른 필드만 덮어씁니다. solution: Type 컬럼이 없는 파일에 쓸 솔루션 이름."""
        self.columns = {**self.COLUMNS, **(columns or {})}
        self.solution = solution
        self.required = {"occurred_at"} if solution else {"occurred_at", "solution"}
        self.known = {name for names in self.columns.values() for name in names} | _IGNORED

    def check(self, columns: Sequence[str]) -> None:
        missing = [" / ".join(names) for f, names in self.columns.items() if f in self.required and not any(n in columns for n in names)]
        if missing:
            raise ValueError(f"컬럼이 없습니다: {', '.join(missing)}")

    def get(self, row: Row, name: str) -> str:
        for column in self.columns[name]:
            if column in row:
                if not row[column] and name in self.required:
                    raise ValueError(f"{column} 값이 비어 있습니다")
                return row[column]
        return ""

    def map(self, row: Row) -> SecurityEvent:
        fields = ("who", "where", "how", "user_id", "user_name", "department", "source_ip", "tenant_id")
        return SecurityEvent(
            solution=self.solution or self.get(row, "solution").removesuffix("_CL"),
            occurred_at=parse_datetime(self.get(row, "occurred_at")),
            **{f: self.get(row, f) for f in fields},
            attributes={k: v for k, v in row.items() if k not in self.known},
        )


# --- 읽기 ---

SUFFIXES = (".csv", ".tsv", ".json", ".jsonl")


def _clean(row: Mapping[Any, Any]) -> Row:
    # csv.DictReader 는 컬럼보다 값이 많은 행에 None 키를 붙입니다.
    return {str(k).strip(): ("" if v is None else str(v).strip()) for k, v in row.items() if k is not None}


def _rows(path: Path) -> Iterator[tuple[int, Row]]:
    """(위치, 행). 위치는 CSV 면 파일 행 번호, JSON 이면 순번입니다."""
    if not path.is_file():
        raise FileNotFoundError(f"데이터 파일이 없습니다: {path}")
    if path.suffix in (".csv", ".tsv"):
        # utf-8-sig 라야 BOM 포함 파일의 첫 컬럼 이름이 깨지지 않습니다.
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f, delimiter="\t" if path.suffix == ".tsv" else ",")
            for row in reader:
                if any((v or "").strip() for v in row.values() if isinstance(v, str)):
                    yield reader.line_num, _clean(row)
        return
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".jsonl":
        items = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        items = json.loads(text)
        if isinstance(items, dict):
            # API 응답은 {"value": [...]} 처럼 목록을 한 겹 감싸는 경우가 많습니다.
            lists = [v for v in items.values() if isinstance(v, list)]
            if len(lists) != 1:
                raise ValueError(f"{path.name}: 행 목록을 찾을 수 없습니다")
            items = lists[0]
    for n, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"{path.name}: {n}번째 항목이 객체가 아닙니다")
        yield n, _clean(item)


def _read(name: str, rows: Iterable[tuple[int, Row]], mapper: EventMapper, strict: bool) -> LoadResult:
    result = LoadResult(source=name)
    checked = False
    for line, row in rows:
        if not checked:
            try:
                mapper.check(list(row))
            except ValueError as exc:
                raise ValueError(f"{name}: {exc}") from None
            checked = True
        try:
            result.records.append(mapper.map(row))
        except ValueError as exc:  # pydantic 의 ValidationError 도 여기로 옵니다.
            if strict:
                raise ValueError(f"{name} {line}행: {exc}") from None
            result.issues.append(LoadIssue(line, str(exc)))
    return result


def _load(target: Any, mapper: EventMapper, strict: bool) -> LoadResult:
    """target = 파일 · 폴더 경로 또는 행(dict) 목록. 필수 컬럼이 없으면 ValueError."""
    if not isinstance(target, (str, Path)):
        return _read("memory", enumerate((_clean(r) for r in target), start=1), mapper, strict)
    path = Path(target) if Path(target).is_absolute() else ROOT / target
    if not path.is_dir():
        if path.suffix.lower() not in SUFFIXES:
            raise ValueError(f"읽을 수 없는 형식입니다: {path.name} (지원: {', '.join(SUFFIXES)})")
        return _read(path.name, _rows(path), mapper, strict)
    # 컬럼이 맞지 않는 파일 하나 때문에 폴더의 나머지 파일을 버리지 않습니다.
    result = LoadResult(source=path.name)
    for file in sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() in SUFFIXES):
        try:
            part = _read(file.name, _rows(file), mapper, strict)
        except ValueError as exc:
            if strict:
                raise
            result.issues.append(LoadIssue(0, str(exc)))
            continue
        result.records += part.records
        result.issues += [LoadIssue(i.line, f"{file.name} {i.message}") for i in part.issues]
    return result


def load_events(
    target: Any,
    mapper: EventMapper | None = None,
    strict: bool = False,
    since: datetime | None = None,
    until: datetime | None = None,
) -> LoadResult:
    """범위 밖 로그는 오류가 아니므로 issues 에 넣지 않습니다."""
    result = _load(target, mapper or EventMapper(), strict)
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


def group_subject(group: list[SecurityEvent]) -> str:
    """묶음의 "부서 이름" — 판정 대상 칸 · 조항 검색어에 같은 글을 씁니다."""
    first = group[0]
    return f"{first.department} {first.who or first.user_name}".strip()


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


def threat_marks(e: SecurityEvent) -> list[str]:
    """코드가 정하는 사실(예외 승인 · 민감 문서 · 근무 시간 밖)만 붙입니다."""
    marks = ["예외 승인"] if _exception(e) else []
    if words := _sensitive(e):
        marks.append(f"민감 문서({', '.join(words)})")
    if _off_hours(e):
        marks.append("근무 시간 밖")
    return marks


def threat_lines(events: list[SecurityEvent], limit: int) -> list[str]:
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
