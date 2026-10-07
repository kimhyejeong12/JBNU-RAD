"""접근 권한 신청 검토 — 정책 이해."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable, RunnablePassthrough

from ..prompt import Prompts
from ..types import Verdict
from .retrieval import lookup

if TYPE_CHECKING:
    from ..engine import Engine


def review_chain(
    engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any
) -> Runnable[dict[str, Any], Any]:
    """접근 권한 적정성 판단.

    입력: requester, requested_access, current_access
    (retrieve=False 면 context 도 직접 넘겨야 합니다.)
    """
    reviewer = engine.chain(Prompts.ACCESS_REVIEW, Verdict, **kwargs)
    if not retrieve:
        return reviewer
    return RunnablePassthrough.assign(context=_query | lookup(engine, k, "clause")) | reviewer


def _query(inputs: dict[str, Any]) -> str:
    return f"{inputs['requester']} / {inputs['requested_access']}"
