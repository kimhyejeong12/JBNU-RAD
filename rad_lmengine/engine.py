from __future__ import annotations

from typing import Any

import ollama
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable
from langchain_ollama import ChatOllama
from pydantic import BaseModel

from . import chains
from .config import Settings
from .rag import DocumentStore


class Engine:
    """LLM 과 문서 저장소를 묶은 진입점.

    체인 메서드는 모두 LangChain `Runnable` 을 돌려주므로 그대로 `.invoke()` /
    `.stream()` 하거나 LangGraph 노드로 넣을 수 있습니다.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings.load()
        self.documents = DocumentStore(self.settings)
        self._llm: ChatOllama | None = None

    @property
    def llm(self) -> ChatOllama:
        if self._llm is None:
            self._llm = ChatOllama(**self.settings.llm_options)
        return self._llm

    def with_model(self, model: str) -> ChatOllama:
        return ChatOllama(**{**self.settings.llm_options, "model": model})

    def models(self) -> list[str]:
        client = ollama.Client(host=self.settings.ollama_base_url)
        return sorted(m.model for m in client.list().models if m.model)

    def has_model(self, name: str, available: list[str] | None = None) -> bool:
        names = available if available is not None else self.models()
        return name in names or f"{name}:latest" in names

    def chain(
        self,
        prompt: ChatPromptTemplate,
        schema: type[BaseModel] | None = None,
        llm: ChatOllama | None = None,
    ) -> Runnable[dict[str, Any], Any]:
        model = llm or self.llm
        if schema is not None:
            return prompt | model.with_structured_output(schema)
        return prompt | model | StrOutputParser()

    # 체인 본체는 chains/ 에 기능별로 있습니다. 기존 호출(engine.review_chain() 등)을 그대로 두려고 여기서 넘겨 줍니다.

    def review_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        """접근 권한 신청 검토 — chains/access.py"""
        return chains.review_chain(self, *args, **kwargs)

    def policy_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        """정책 모순 판정 — chains/policy.py"""
        return chains.policy_chain(self, *args, **kwargs)

    def event_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        """로그 ↔ 정책 비교 — chains/event.py"""
        return chains.event_chain(self, *args, **kwargs)

    def answer_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        """근거를 직접 넘기는 질의응답 — chains/answer.py"""
        return chains.answer_chain(self, *args, **kwargs)

    def rag_chain(self, *args: Any, **kwargs: Any) -> Runnable[str, Any]:
        """저장소 검색 질의응답 — chains/answer.py"""
        return chains.rag_chain(self, *args, **kwargs)
