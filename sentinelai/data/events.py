"""보안 솔루션 로그를 판정 단위로 자르고 묶습니다.

로그는 건수가 많아 한 건씩 판정하지 않습니다. 지난번 이후 쌓인 것만 골라(between)
사용자별로 묶은 뒤(group_by_user) 묶음 하나를 event_chain 에 한 번 넘깁니다.
"""
from __future__ import annotations

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
