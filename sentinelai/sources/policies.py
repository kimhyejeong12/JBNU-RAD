"""솔루션 정책 규칙 (방화벽 · SWG · DLP · PAM 등을 공통 형식으로) — 구조체 · 컬럼 · 읽기."""
from __future__ import annotations

from typing import Any

from .base import ColumnMapper, LoadResult, Record, Row, load


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
        """한 줄에 한 건."""
        return "\n".join(rule.describe() for rule in rules)


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


def load_policies(target: Any, mapper: PolicyRuleMapper | None = None, strict: bool = False) -> LoadResult:
    return load(target, mapper or PolicyRuleMapper(), strict)
