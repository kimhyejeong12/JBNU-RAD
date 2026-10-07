"""데이터 계층이 돌려주는 공통 레코드.

어느 환경에서 읽었든 같은 타입으로 맞춥니다. 값은 원본 그대로 문자열로 두고,
환경마다 표기가 달라 맞춰야 하는 발생 시각만 datetime 으로 바꿉니다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from pydantic import BaseModel


class Record(BaseModel):
    # 판정 근거를 원본까지 거슬러 올라갈 수 있게 원본 행을 함께 들고 다닙니다.
    raw: dict[str, str] = {}


class SecurityEvent(Record):
    """보안 솔루션 로그 한 건. 솔루션마다 다른 컬럼은 attributes 에 담습니다."""

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

    def describe(self) -> str:
        """프롬프트에 넣을 한 줄 요약."""
        line = (
            f"- {self.occurred_at:%Y-%m-%d %H:%M:%S} UTC [{self.solution}] "
            f"{self.department} {self.who}({self.source_ip or 'IP 없음'}) — {self.where} / {self.how}"
        )
        if self.attributes:
            line += " / " + ", ".join(f"{k}={v}" for k, v in self.attributes.items())
        return line


class AccessRequest(Record):
    id: str
    requester: str
    requested_access: str
    current_access: str = ""
    requested_on: str = ""

    def review_input(self) -> dict[str, str]:
        """review_chain 입력."""
        return {
            "requester": self.requester,
            "requested_access": self.requested_access,
            "current_access": self.current_access,
        }


class PolicyRule(Record):
    policy_id: str
    solution: str = ""
    source: str = ""
    destination: str = ""
    service: str = ""
    action: str = ""
    expires_at: str = ""

    def describe(self) -> str:
        return (
            f"- {self.policy_id} [{self.solution}] "
            f"출발지 {self.source} → 목적지 {self.destination} / "
            f"서비스 {self.service} / 동작 {self.action} / 만료 {self.expires_at or '만료일 없음'}"
        )

    @staticmethod
    def format(rules: list[PolicyRule]) -> str:
        """policy_chain 의 policies 입력."""
        return "\n".join(rule.describe() for rule in rules)


@dataclass
class LoadIssue:
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.line}행: {self.message}"


@dataclass
class LoadResult:
    source: str
    records: list = field(default_factory=list)
    # 한 행이 깨져도 나머지는 쓸 수 있게 예외 대신 모아 둡니다.
    issues: list[LoadIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues

    def __str__(self) -> str:
        return f"{self.source}: {len(self.records)}건 읽음, 실패 {len(self.issues)}건"
