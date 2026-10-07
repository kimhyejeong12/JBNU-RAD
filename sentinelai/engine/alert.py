"""로그 감시 결과를 운영자에게 알리는 자리 — 아직 구현하지 않았습니다 (CLAUDE.md §8).

event_chain 의 Verdict 중 주의 · 위험을 알림으로 내보낼 인터페이스만 정해 둡니다.
내보내는 곳(파일 · 대시보드 · 메일 · 메신저)은 나중에 이 인터페이스를 구현해 붙입니다.
지금은 scripts/review_events.py 가 결과를 출력 · JSON 으로 남기는 것으로 대신합니다.
"""
from __future__ import annotations

from typing import Protocol

from .types import Verdict


class Notifier(Protocol):
    def send(self, subject: str, verdict: Verdict, evidence: str) -> None:
        """subject: 대상 사용자, evidence: 판정에 쓴 로그 (한 줄에 한 건)."""
        ...
