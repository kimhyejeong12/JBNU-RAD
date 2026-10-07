"""SentinelAI 엔진 — 정책을 RAG 에 쌓고 정책 이해 · 로그 감시를 판정하는 코어.

    from sentinelai.engine import Engine

    engine = Engine()
    engine.documents.index("docs")
    engine.rag_chain().invoke("급여 정보 접근 승인은 누가?")
"""

from .engine import Engine
from .config import Settings
from .prompt import Prompts
from .rag import DocumentStore, IndexReport
from .types import Answer, PolicyIssue, PolicyReview, RiskLevel, Verdict

from .. import __version__

__all__ = [
    "Answer",
    "DocumentStore",
    "Engine",
    "IndexReport",
    "PolicyIssue",
    "PolicyReview",
    "Prompts",
    "RiskLevel",
    "Settings",
    "Verdict",
    "__version__",
]
