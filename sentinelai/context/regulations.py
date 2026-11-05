"""규정 RAG — 기준 조항 · 솔루션 규칙을 종류별로 찾습니다. 한 번에 찾으면 규칙에 조항이 밀려납니다."""
from __future__ import annotations

from typing import Any

NO_CLAUSE = "찾은 기준 조항 없음"
NO_RULE = "찾은 솔루션 정책 없음"


class Regulations:
    def __init__(self, documents: Any, k: int | None = None) -> None:
        self.documents = documents
        self.k = k

    def _find(self, query: str, kind: str, empty: str) -> str:
        return self.documents.format(self.documents.search(query, self.k, kind)) or empty

    def clauses(self, query: str) -> str:
        return self._find(query, "clause", NO_CLAUSE)

    def rules(self, query: str) -> str:
        return self._find(query, "rule", NO_RULE)
