"""RAD-LMENGINE — 로컬 LLM·RAG 기반 보안 정책·접근 권한 의사결정 코어.

    from rad_lmengine import Engine

    engine = Engine()
    engine.documents.index("docs")
    engine.rag_chain().invoke("급여 정보 접근 승인은 누가?")
"""

from .engine import Engine
from .config import Settings
from .prompt import Prompts
from .rag import DocumentStore, IndexReport
from .types import Answer, PolicyIssue, PolicyReview, RiskLevel, Verdict

__version__ = "0.6.0"

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
