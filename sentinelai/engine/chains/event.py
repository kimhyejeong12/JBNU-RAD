"""보안 솔루션 로그를 정책과 비교 — 로그 감시."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.runnables import Runnable, RunnablePassthrough

from ..prompt import Prompts
from ..types import Verdict
from .retrieval import lookup

if TYPE_CHECKING:
    from ..engine import Engine


def event_chain(
    engine: Engine, retrieve: bool = True, k: int | None = None, **kwargs: Any
) -> Runnable[dict[str, Any], Any]:
    """로그 묶음(한 사용자)을 정책과 비교해 판단합니다. 결과는 권한 검토와 같은 Verdict 입니다.

    입력: subject(대상 사용자), events(한 줄에 한 건)
    (retrieve=False 면 context · rules 도 직접 넘겨야 합니다.)
    """
    reviewer = engine.chain(Prompts.EVENT_REVIEW, Verdict, **kwargs)
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
    return f"{inputs['subject']} / {inputs['events']}"
