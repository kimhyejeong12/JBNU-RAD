"""SentinelAI 엔진 — 정책을 RAG 에 쌓고 정책 이해 · 로그 감시를 판정하는 코어.

    engine.py    Settings · Engine(모델 · RAG · 두 DB · 기능 · 작업 큐)
    pipeline.py  체인과 판정 흐름
    rag.py       DocumentStore · 종류별 검색
    prompt.py    프롬프트
    types.py     출력 타입 · Notifier

    from sentinelai.engine import Engine

    engine = Engine()
    engine.index()                                        # docs/ 적재 (바뀐 파일만)
    engine.rag_chain().invoke("급여 정보 접근 승인은 누가?")
"""

from .engine import KINDS, MANUAL, Engine, Settings
from .prompt import Prompts
from .rag import DocumentStore, IndexReport
from .types import Answer, LogFilter, Notifier, PolicyIssue, PolicyReview, RiskLevel, ServerGap, ServerReview, Verdict

from .. import __version__

__all__ = [
    "KINDS",
    "MANUAL",
    "Answer",
    "DocumentStore",
    "Engine",
    "IndexReport",
    "LogFilter",
    "Notifier",
    "PolicyIssue",
    "PolicyReview",
    "Prompts",
    "RiskLevel",
    "ServerGap",
    "ServerReview",
    "Settings",
    "Verdict",
    "__version__",
]
