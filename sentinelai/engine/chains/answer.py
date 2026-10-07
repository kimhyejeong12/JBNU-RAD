"""정책 질의응답 — 정책 이해."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable, RunnablePassthrough

from ..prompt import Prompts
from ..types import Answer
from .retrieval import lookup_all

if TYPE_CHECKING:
    from ..engine import Engine


def answer_chain(engine: Engine, structured: bool = False, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """근거를 직접 넘기는 질의응답. 입력: context, question"""
    return engine.chain(Prompts.ANSWER, Answer if structured else None, **kwargs)


def rag_chain(
    engine: Engine, structured: bool = False, k: int | None = None, **kwargs: Any
) -> Runnable[str, Any]:
    """저장소에서 근거(조항 · 규칙)를 찾아 답하는 체인. 입력: 질문 문자열"""
    inputs = {"context": lookup_all(engine, k), "question": RunnablePassthrough()}
    return inputs | answer_chain(engine, structured, **kwargs)
