"""판정 입력 — 판정마다 프롬프트 · 빌더를 짝짓고, 크기는 여기서 한 번만 맞춥니다. 데이터는 모두 데이터 계층(sources)이 모아 넘깁니다."""
from __future__ import annotations

from typing import Any

from ..sources import Person, SecurityEvent, ServerSnapshot
from . import builders
from .budget import Built, Section, fit, limit
from .prompts import Prompts


class Inputs:
    def __init__(self, settings: Any) -> None:
        self.settings = settings

    def _fit(self, prompt: Any, sections: list[Section]) -> Built:
        return fit(sections, limit(self.settings, prompt))

    def request(self, row: dict[str, Any], person: Person, clauses: str) -> Built:
        return self._fit(Prompts.ACCESS_REVIEW, builders.request(row, person, clauses))

    def grant(self, row: dict[str, Any], person: Person, clauses: str) -> Built:
        return self._fit(Prompts.GRANT_REVIEW, builders.grant(row, person, clauses))

    def events(self, group: list[SecurityEvent], person: Person, clauses: str, fast: bool = False) -> Built:
        return self._fit(Prompts.EVENT_REVIEW, builders.events(group, person, clauses, fast))

    def suspect(self, info: dict[str, Any], person: Person, clauses: str) -> Built:
        return self._fit(Prompts.SUSPECT, builders.suspect(info, person, clauses))

    def server(self, snapshot: ServerSnapshot, changed: list[str], clauses: str, decided: list[dict[str, Any]]) -> Built:
        return self._fit(Prompts.SERVER_REVIEW, builders.server(snapshot, changed, clauses, decided))

    def policy(self, documents: str, decided: list[dict[str, Any]]) -> Built:
        return self._fit(Prompts.POLICY_CONFLICT, builders.policy(documents, decided))
