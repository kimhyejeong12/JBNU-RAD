"""보안 솔루션 로그를 판정 단위로 자르고 묶고, 질의에 맞춰 찾고 셉니다.

로그는 건수가 많아 한 건씩 판정하지 않습니다. 지난번 이후 쌓인 것만 골라(between)
사용자별로 묶은 뒤(group_by_user) 묶음 하나를 event_chain 에 한 번 넘깁니다.
로그 질의는 모델에게 세게 하지 않고 여기서 찾고(search) 셉니다(summarize).
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from datetime import datetime, timezone

from .types import SecurityEvent


def _utc(moment: datetime) -> datetime:
    # 레코드의 occurred_at 은 UTC 라서 시간대 없는 값과는 비교할 수 없습니다.
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment


def between(
    events: Iterable[SecurityEvent], since: datetime | None = None, until: datetime | None = None
) -> list[SecurityEvent]:
    """since 초과 ~ until 이하. 지난 실행의 마지막 시각을 since 로 넘기면 같은 로그를 두 번 판정하지 않습니다.

    시간대 없는 값은 UTC 로 봅니다.
    """
    since = _utc(since) if since else None
    until = _utc(until) if until else None
    return [
        e for e in events
        if (since is None or e.occurred_at > since) and (until is None or e.occurred_at <= until)
    ]


def latest(events: Iterable[SecurityEvent]) -> datetime | None:
    """다음 실행에 since 로 넘길 시각."""
    return max((e.occurred_at for e in events), default=None)


def group_by_user(events: Iterable[SecurityEvent]) -> dict[str, list[SecurityEvent]]:
    """사용자 ID 로 묶습니다. ID 가 없는 내보내기는 행위자 이름으로 묶습니다."""
    groups: dict[str, list[SecurityEvent]] = {}
    for e in sorted(events, key=lambda e: e.occurred_at):
        groups.setdefault(e.user_id or e.who, []).append(e)
    return groups


def event_review_input(events: list[SecurityEvent]) -> dict[str, str]:
    """한 사용자의 로그 묶음 → event_chain 입력."""
    first = events[0]
    return {
        "subject": f"{first.department} {first.who or first.user_name}".strip(),
        "events": "\n".join(e.describe() for e in events),
    }


# --- 로그 질의 ---------------------------------------------------------------


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
    """조건마다 부분 일치(대소문자 무시)로 고릅니다. 빈 조건은 보지 않습니다.

    user 는 행위자 · 이름 · ID · "부서 이름" 중 하나에 맞으면 됩니다.
    keyword 는 솔루션 고유 항목에서 찾습니다. "항목=값"(Exception=1)이면 그 항목 값이 같아야 하고, 아니면 부분 일치입니다.
    """
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


def _number(value: str) -> float | None:
    try:
        return float(value.replace(",", ""))
    except ValueError:
        return None


def summarize(events: list[SecurityEvent]) -> dict:
    """건수 · 분포 · 숫자 항목 합계. 질의 답변의 숫자는 모두 여기서 나옵니다."""
    totals: dict[str, float] = {}
    for e in events:
        for k, v in e.attributes.items():
            n = _number(v)
            if n is not None:
                totals[k] = totals.get(k, 0) + n
    count = lambda key: dict(Counter(key(e) for e in events).most_common())  # noqa: E731
    return {
        "count": len(events),
        "first": events[0].occurred_at.isoformat() if events else None,
        "last": events[-1].occurred_at.isoformat() if events else None,
        "by_user": count(lambda e: f"{e.department} {e.who or e.user_name}".strip()),
        "by_solution": count(lambda e: e.solution),
        "by_how": count(lambda e: e.how),
        "by_day": count(lambda e: e.occurred_at.date().isoformat()),
        # 숫자로 읽히는 솔루션 고유 항목만 더합니다 (예: PrintCount). 0/1 항목은 해당 건수가 됩니다.
        "attribute_totals": {k: int(v) if v.is_integer() else v for k, v in totals.items()},
    }


def vocabulary(events: list[SecurityEvent]) -> dict:
    """로그에 실제로 있는 값. 질문의 표현을 로그 표기에 맞추도록 모델에게 보여줍니다."""
    distinct = lambda key: sorted({key(e) for e in events if key(e)})  # noqa: E731
    return {
        "users": distinct(lambda e: f"{e.department} {e.who or e.user_name}".strip()),
        "departments": distinct(lambda e: e.department),
        "solutions": distinct(lambda e: e.solution),
        "where": distinct(lambda e: e.where),
        "how": distinct(lambda e: e.how),
        "attributes": sorted({k for e in events for k in e.attributes}),
        "first": min(e.occurred_at for e in events).isoformat() if events else None,
        "last": max(e.occurred_at for e in events).isoformat() if events else None,
    }
