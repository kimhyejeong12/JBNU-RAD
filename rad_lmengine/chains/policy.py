"""솔루션 정책 간 모순 판정 — 정책 이해."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable, RunnablePassthrough

from ..prompt import Prompts
from ..types import PolicyReview
from .retrieval import lookup

if TYPE_CHECKING:
    from ..engine import Engine


def policy_chain(
    engine: Engine, structured: bool = True, retrieve: bool = True, k: int | None = None, **kwargs: Any
) -> Runnable[dict[str, Any], Any]:
    """정책 중복·충돌·과도한 허용 검토.

    입력: policies (한 줄에 한 건). 규칙은 입력으로 받으므로 기준 조항만 찾습니다.
    (retrieve=False 면 context 도 직접 넘겨야 합니다.)
    """
    reviewer = engine.chain(Prompts.POLICY_CONFLICT, PolicyReview if structured else None, **kwargs)
    if not retrieve:
        return reviewer
    return RunnablePassthrough.assign(context=_query | lookup(engine, k, "clause")) | reviewer


def _query(inputs: dict[str, Any]) -> str:
    return inputs["policies"]
