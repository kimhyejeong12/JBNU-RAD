"""자원 — LLM 연결 · 벡터 DB · 두 DB · 데이터 계층 · 프롬프트 모듈을 처음 쓸 때 한 번만 열어 이슈어 · 워커가 나눠 씁니다."""
from __future__ import annotations

from functools import cached_property
from typing import Any

import ollama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable
from langchain_ollama import ChatOllama
from pydantic import BaseModel

from ..context import Inputs
from ..db import Database, open_main_db, open_results_db
from ..sources import Sources
from .rag import DocumentStore
from .settings import Settings


class Resources:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings.load()
        self.documents = DocumentStore(self.settings)
        self._llms: dict[bool, ChatOllama] = {}
        self._qa: ChatOllama | None = None

    # --- LLM ---

    def llm(self, think: bool = True) -> ChatOllama:
        """판정 모델 연결 — think=False 면 생각 단계를 꺼 빠르지만 덜 정확합니다 (1차 판정용)."""
        if think not in self._llms:
            options = self.settings.llm_options
            self._llms[think] = ChatOllama(**options) if think else ChatOllama(**{**options, "reasoning": False})
        return self._llms[think]

    def qa_llm(self) -> ChatOllama:
        """질답 모델 연결 — 질의 에이전트가 도구를 붙여 씁니다."""
        if self._qa is None:
            self._qa = ChatOllama(**{**self.settings.llm_options, "model": self.settings.qa_model, "reasoning": True})
        return self._qa

    def chain(self, prompt: ChatPromptTemplate, schema: type[BaseModel], think: bool = True) -> Runnable[dict[str, Any], Any]:
        return prompt | self.llm(think).with_structured_output(schema)

    # --- 저장소 · 데이터 ---

    @cached_property
    def main_db(self) -> Database:
        """권한 DB — 계정 · 신청 · 결재 · 운영자 결정 · 노드 등록부."""
        return open_main_db(self.settings.db_path)

    @cached_property
    def results_db(self) -> Database:
        """AI 결과 DB — 판정 · 수집 · 질의 기록."""
        return open_results_db(self.settings.results_db_path)

    @cached_property
    def sources(self) -> Sources:
        """데이터 계층 — DLP 로그 · 서버 상태 · DB 의 사용자 데이터 · RAG 기준 문서."""
        return Sources(self.settings, self.main_db, self.results_db, self.documents)

    @cached_property
    def inputs(self) -> Inputs:
        """프롬프트 모듈 — 판정마다 데이터를 입력 글로 쓰고 크기를 맞춥니다."""
        return Inputs(self.settings)

    # --- 상태 ---

    def health(self) -> dict[str, Any]:
        """Ollama 연결 · 판정 · 질답 · 임베딩 모델 · 인덱스. 모두 준비되면 ok."""
        s = self.settings
        info: dict[str, Any] = {"base_url": s.ollama_base_url, "model": s.model, "qa_model": s.qa_model,
                                "embedding_model": s.embedding_model, "connected": False, "model_ready": False,
                                "qa_model_ready": False, "embedding_ready": False, "error": None}
        try:
            client = ollama.Client(host=s.ollama_base_url)
            names = {m.model for m in client.list().models if m.model}
            has = lambda name: name in names or f"{name}:latest" in names  # noqa: E731
            info.update(connected=True, model_ready=has(s.model), qa_model_ready=has(s.qa_model), embedding_ready=has(s.embedding_model))
        except Exception as exc:
            info["error"] = f"{type(exc).__name__}: {exc}"
        info["index_ready"] = not self.documents.is_empty()
        info["ok"] = all(info[k] for k in ("connected", "model_ready", "qa_model_ready", "embedding_ready", "index_ready"))
        return info

    def close(self) -> None:
        """벡터 DB 잠금을 풀어 다른 프로세스가 열 수 있게 합니다."""
        self.documents.close()


__all__ = ["Resources"]
