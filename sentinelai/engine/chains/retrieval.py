"""체인들이 함께 쓰는 검색 단계. 질의 문자열 → 프롬프트에 넣을 근거 텍스트."""
from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.runnables import Runnable, RunnableParallel

from ..rag import DocumentStore

if TYPE_CHECKING:
    from ..engine import Engine


def lookup(engine: Engine, k: int | None, kind: str) -> Runnable[str, str]:
    """한 종류(clause · rule)만 찾습니다."""
    return engine.documents.retriever(k, kind) | DocumentStore.format


def lookup_all(engine: Engine, k: int | None) -> Runnable[str, str]:
    """조항과 규칙을 따로 찾아 이어 붙입니다. 한 번에 찾으면 규칙에 조항이 밀려나기 때문입니다."""
    both = RunnableParallel(clause=lookup(engine, k, "clause"), rule=lookup(engine, k, "rule"))
    return both | (lambda found: "\n\n".join(text for text in found.values() if text))
