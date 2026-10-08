"""로그 질의 — 로그 감시.

로그는 RAG 로 찾지 않습니다. "몇 번 · 언제부터 · 누가" 같은 질문은 집계라서, 비슷한 몇 줄만 찾아오면 건수가 틀립니다.
모델은 질문을 조건으로 바꾸고(log_filter_chain) 코드가 센 결과로 답을 쓰기만 합니다(log_answer_chain).
찾고 세는 일은 sentinelai.data(search · summarize), 둘을 잇는 일은 sentinelai.pipeline.ask_logs 가 합니다.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable

from ..prompt import Prompts
from ..types import LogFilter

if TYPE_CHECKING:
    from ..engine import Engine


def log_filter_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """질문 → LogFilter. 입력: question, vocabulary(로그에 있는 값), now(현재 시각 UTC)"""
    return engine.chain(Prompts.LOG_FILTER, LogFilter, **kwargs)


def log_answer_chain(engine: Engine, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
    """조건 · 집계 · 로그 → 답변 문자열. 입력: question, criteria, facts, lines"""
    return engine.chain(Prompts.LOG_ANSWER, None, **kwargs)
