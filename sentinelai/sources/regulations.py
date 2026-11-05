"""규정 RAG — 판정마다 검색어를 만들어 기준 문서에서 조항을 찾고, 정책 관리 검토에는 쌓인 문서 전체를 꺼냅니다."""
from __future__ import annotations

from typing import Any

from .logs import SecurityEvent, group_subject
from .people import access_text, move_text, reason_text, requester_text
from .snapshots import ServerSnapshot, server_lines

NO_CLAUSE = "찾은 기준 조항 없음"
NO_DOCUMENT = "RAG 에 올라간 기준 문서 없음"


class Regulations:
    """documents = 엔진의 DocumentStore (search · chunks · format) — 이 계층은 엔진을 가져오지 않습니다."""

    def __init__(self, documents: Any, k: int | None = None) -> None:
        self.documents = documents
        self.k = k

    def clauses(self, query: str) -> str:
        return self.documents.format(self.documents.search(query, self.k)) or NO_CLAUSE

    def everything(self) -> str:
        """쌓인 조각 전부 (문서 · 원래 순서대로) — 문서끼리 견주려면 비슷한 몇 개가 아니라 전부가 필요합니다."""
        return self.documents.format(self.documents.chunks()) or NO_DOCUMENT

    def for_request(self, row: dict[str, Any]) -> str:
        return self.clauses(f"{requester_text(row)} / {access_text(row)} / {reason_text(row)}")

    def for_grant(self, row: dict[str, Any]) -> str:
        move = row["move"]
        return self.clauses(f"{requester_text(row, move['to_department'])} / {access_text(row)} / {move_text(move)}")

    def for_events(self, group: list[SecurityEvent]) -> str:
        return self.clauses(f"{group_subject(group)} / " + "\n".join(e.describe() for e in group))

    def for_suspect(self, info: dict[str, Any]) -> str:
        """눈에 띄는 신호 · 민감 문서 낱말로 찾습니다."""
        signals = info["signals"] or {}
        who = f"{info['department']} {info['name']}".strip()
        return self.clauses(" / ".join([who, *signals.get("highlights", []), ", ".join(signals.get("sensitive_words", []))]))

    def for_server(self, snapshot: ServerSnapshot, changed: list[str]) -> str:
        return self.clauses(f"{snapshot.name} / " + "\n".join(server_lines(snapshot, changed)))
