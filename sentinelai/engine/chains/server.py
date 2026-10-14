"""서버 현황을 정책 문서와 비교 — 정책 이해."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable, RunnablePassthrough

from ..prompt import Prompts
from ..types import ServerReview
from .retrieval import lookup

if TYPE_CHECKING:
    from ..engine import Engine


def server_chain(
    engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any
) -> Runnable[dict[str, Any], Any]:
    """서버 한 대의 현황과 그 서버에 걸린 솔루션 정책을 기준 문서에 비춰 검증합니다. 결과는 ServerReview(기준 문서와 다른 곳 · 바꿀 것)입니다.

    입력: subject(서버), state(현황, 한 줄에 한 항목), matched(코드가 IP · 대역 · 호스트 이름으로 찾은 규칙)
    코드가 못 찾은 규칙(표기가 다른 것)은 rules 로 검색해 보탭니다.
    (retrieve=False 면 context · rules 도 직접 넘겨야 합니다.)
    """
    reviewer = engine.chain(Prompts.SERVER_REVIEW, ServerReview, **kwargs)
    if not retrieve:
        return reviewer
    return (
        RunnablePassthrough.assign(
            context=_query | lookup(engine, k, "clause"),
            rules=_query | lookup(engine, k, "rule"),
        )
        | reviewer
    )


def _query(inputs: dict[str, Any]) -> str:
    return f"{inputs['subject']} / {inputs['state']}"
