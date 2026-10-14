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


class ServerState(Record):
    """서버 현황 한 대. 호스트(또는 IP)만 정해 두고, 나머지 컬럼(용도 · 노출 · 포트 · 패치 등)은 attributes 에 그대로 담습니다.

    현황 파일은 자산관리 · 점검 도구마다 컬럼이 달라 필드를 늘리지 않습니다. 판정은 컬럼 이름과 값을 그대로 읽습니다.
    """

    host: str
    ip: str = ""
    attributes: dict[str, str] = {}

    @property
    def name(self) -> str:
        return f"{self.host} ({self.ip})" if self.ip and self.ip != self.host else self.host

    def describe(self) -> str:
        """server_chain 의 state 입력. 한 줄에 한 항목."""
        return "\n".join([f"- 서버: {self.name}", *(f"- {k}: {v}" for k, v in self.attributes.items() if v)])


@dataclass
class LoadIssue:
    line: int
    message: str

    def __str__(self) -> str:
        # 0행은 파일 전체의 문제(폴더 안의 컬럼이 맞지 않는 파일 등)입니다.
        return f"{self.line}행: {self.message}" if self.line else self.message


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
