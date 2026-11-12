"""맥락 — 프롬프트 합성만 합니다. 데이터 계층(sources)이 모은 대상 · 사람 · 규정 RAG 결과 · 운영자 결정을 프롬프트 입력으로 쓰고 크기를 맞춥니다."""
from . import builders, precedent
from .budget import Built, Section, fit, limit
from .inputs import Inputs
from .prompts import Prompts

__all__ = ["Built", "Inputs", "Prompts", "Section", "builders", "fit", "limit", "precedent"]
