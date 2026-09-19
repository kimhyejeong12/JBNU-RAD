from __future__ import annotations

from typing import Any

import ollama
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable, RunnablePassthrough
from langchain_ollama import ChatOllama
from pydantic import BaseModel

from .config import Settings
from .prompt import Prompts
from .rag import DocumentStore
from .types import Answer, PolicyReview, Verdict


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

    def answer_chain(self, structured: bool = False, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        """근거를 직접 넘기는 질의응답. 입력: context, question"""
        return self.chain(Prompts.ANSWER, Answer if structured else None, **kwargs)

    def policy_chain(self, structured: bool = True, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        """정책 중복·충돌·과도한 허용 검토. 입력: policies"""
        return self.chain(Prompts.POLICY_CONFLICT, PolicyReview if structured else None, **kwargs)

    def review_chain(
        self, retrieve: bool = True, k: int | None = None, **kwargs: Any
    ) -> Runnable[dict[str, Any], Any]:
        """접근 권한 적정성 판단.

        입력: requester, requested_access, current_access
        (retrieve=False 면 context 도 직접 넘겨야 합니다.)
        """
        reviewer = self.chain(Prompts.ACCESS_REVIEW, Verdict, **kwargs)
        if not retrieve:
            return reviewer
        lookup = self._review_query | self.documents.retriever(k) | DocumentStore.format
        return RunnablePassthrough.assign(context=lookup) | reviewer

    @staticmethod
    def _review_query(inputs: dict[str, Any]) -> str:
        return f"{inputs['requester']} / {inputs['requested_access']}"

    def rag_chain(
        self, structured: bool = False, k: int | None = None, **kwargs: Any
    ) -> Runnable[str, Any]:
        """저장소에서 근거를 찾아 답하는 체인. 입력: 질문 문자열"""
        lookup = {
            "context": self.documents.retriever(k) | DocumentStore.format,
            "question": RunnablePassthrough(),
        }
        return lookup | self.answer_chain(structured, **kwargs)
