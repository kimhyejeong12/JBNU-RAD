"""원본 행을 레코드로 바꾸는 매퍼.

같은 항목도 내보낸 환경마다 컬럼 이름이 다릅니다 (포털 CSV 는 "TimeGenerated [UTC]", 쿼리 결과는 "TimeGenerated").
그래서 필드마다 후보 컬럼 이름을 여러 개 두고 앞에서부터 처음 있는 것을 씁니다.
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Protocol

from .source import Row
from .types import AccessRequest, PolicyRule, Record, SecurityEvent


class Mapper(Protocol):
    def check(self, columns: Sequence[str]) -> None:
        """필수 컬럼이 없으면 ValueError."""
        ...

    def map(self, row: Row) -> Record:
        """값이 잘못된 행은 ValueError."""
        ...


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
    # Microsoft Sentinel 의 TimeGenerated 는 UTC 라서 시간대 표기가 없으면 UTC 로 봅니다.
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


Columns = Mapping[str, Sequence[str]]


class ColumnMapper:
    """COLUMNS(필드 → 후보 컬럼 이름)로 행을 읽는 바탕 클래스. REQUIRED 에 없는 필드는 비어 있어도 됩니다."""

    COLUMNS: Columns = {}
    REQUIRED: frozenset[str] = frozenset()

    def __init__(self, columns: Columns | None = None) -> None:
        """columns: 이름이 다른 필드만 덮어씁니다."""
        self.columns = {**self.COLUMNS, **(columns or {})}
        self.required = set(self.REQUIRED)

    def check(self, columns: Sequence[str]) -> None:
        missing = [
            " / ".join(names)
            for f, names in self.columns.items()
            if f in self.required and not any(name in columns for name in names)
        ]
        if missing:
            raise ValueError(f"컬럼이 없습니다: {', '.join(missing)}")

    def known_columns(self) -> set[str]:
        return {name for names in self.columns.values() for name in names}

    def get(self, row: Row, field: str) -> str:
        for name in self.columns[field]:
            if name in row:
                if not row[name] and field in self.required:
                    raise ValueError(f"{name} 값이 비어 있습니다")
                return row[name]
        return ""


# 판정에 쓰지 않는 Log Analytics 공통 컬럼은 attributes 에 넣지 않습니다.
_IGNORED = {"_ResourceId", "SourceSystem", "MG", "ManagementGroupName", "Computer"}


class EventMapper(ColumnMapper):
    """Microsoft Sentinel 사용자 지정 로그(<솔루션>_CL) → SecurityEvent.

    WHO · WHERE · HOW 를 솔루션 공통 컬럼으로 보고 매퍼 하나로 모든 솔루션을 읽습니다.
    """

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
        """solution: Type 컬럼이 없는 파일(솔루션 콘솔에서 직접 내보낸 것 등)에 쓸 솔루션 이름."""
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


class AccessRequestMapper(ColumnMapper):
    COLUMNS = {
        "id": ["id"],
        "requester": ["requester"],
        "requested_access": ["requested_access"],
        "current_access": ["current_access"],
        "requested_on": ["신청일", "requested_on"],
    }
    REQUIRED = frozenset({"id", "requester", "requested_access"})

    def map(self, row: Row) -> AccessRequest:
        return AccessRequest(**{f: self.get(row, f) for f in self.columns}, raw=row)


class PolicyRuleMapper(ColumnMapper):
    COLUMNS = {
        "policy_id": ["policy_id"],
        "solution": ["solution"],
        "source": ["source"],
        "destination": ["destination"],
        "service": ["service"],
        "action": ["action"],
        "expires_at": ["expires_at"],
    }
    REQUIRED = frozenset({"policy_id"})

    def map(self, row: Row) -> PolicyRule:
        return PolicyRule(**{f: self.get(row, f) for f in self.columns}, raw=row)
