"""RAG 저장소 — 기준 문서(원문은 권한 DB)를 조각내 Milvus 컬렉션에 쌓고 찾습니다."""
from __future__ import annotations

import hashlib
import threading
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from langchain_core.documents import Document
from langchain_milvus import Milvus
from langchain_ollama import OllamaEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

if TYPE_CHECKING:
    from .settings import Settings


@dataclass
class IndexReport:
    indexed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    chunks: int = 0

    def __str__(self) -> str:
        return (
            f"{len(self.indexed)}개 문서 갱신({self.chunks}청크), "
            f"{len(self.skipped)}개 문서 변경 없음"
            + (f", {len(self.removed)}개 문서 뺌 ({', '.join(self.removed)})" if self.removed else "")
        )


class DocumentStore:
    """조각마다 source(문서 이름) · doc_hash 를 두고, id 는 "문서 이름|순번"의 해시라 순번을 되짚을 수 있습니다."""

    ALL = "pk != ''"
    # 한 번에 꺼내는 조각 수의 상한입니다 (기준 문서 전체를 읽을 때).
    MAX_CHUNKS = 10000
    INDEX_PARAMS = {"metric_type": "COSINE", "index_type": "FLAT"}

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._embeddings: OllamaEmbeddings | None = None
        self._store: Milvus | None = None
        self._lock = threading.Lock()

    @property
    def embeddings(self) -> OllamaEmbeddings:
        if self._embeddings is None:
            self._embeddings = OllamaEmbeddings(
                base_url=self.settings.ollama_base_url,
                model=self.settings.embedding_model,
            )
        return self._embeddings

    @property
    def store(self) -> Milvus:
        # 여러 스레드가 동시에 열면 Milvus Lite 가 잠금을 두 번 잡아 실패하므로 한 번에 하나만 엽니다.
        with self._lock:
            if self._store is None:
                self._store = self._open()
            return self._store

    def close(self) -> None:
        """연결을 닫고 Milvus Lite 서버까지 멈춰 DB 잠금을 풉니다."""
        with self._lock:
            if self._store is None:
                return
            self._store.client.close()
            self._store = None
            if not self.settings.milvus_is_server:
                # 클라이언트만 닫으면 같은 프로세스의 Milvus Lite 서버가 잠금을 쥐고 있습니다.
                from milvus_lite.server_manager import server_manager_instance

                server_manager_instance.release_server(self.settings.milvus_target)

    def _open(self, drop_old: bool = False) -> Milvus:
        if not self.settings.milvus_is_server:
            self.settings.milvus_path.parent.mkdir(parents=True, exist_ok=True)
        return Milvus(
            embedding_function=self.embeddings,
            connection_args={"uri": self.settings.milvus_target},
            collection_name=self.settings.milvus_collection,
            index_params=self.INDEX_PARAMS,
            auto_id=False,
            drop_old=drop_old,
        )

    @staticmethod
    def _digest(text: str, length: int = 16) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:length]

    @classmethod
    def _expr(cls, name: str) -> str:
        return 'source == "{}"'.format(name.replace("\\", "\\\\").replace('"', '\\"'))

    def _stored_hash(self, name: str) -> str | None:
        try:
            rows = self.store.search_by_metadata(expr=self._expr(name), limit=1)
        except Exception:
            return None
        return rows[0].metadata.get("doc_hash") if rows else None

    def split(self, docs: list[Document]) -> list[Document]:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        return splitter.split_documents(docs)

    def index(self, texts: dict[str, str], rebuild: bool = False) -> IndexReport:
        """이름 → 원문을 RAG 에 맞춥니다 — 바뀐 문서만 다시 임베딩하고, 없는 문서의 조각은 뺍니다. rebuild 면 컬렉션을 비우고 새로."""
        if rebuild:
            with self._lock:
                self._store = self._open(drop_old=True)
        report = IndexReport()
        for name, text in texts.items():
            doc = Document(page_content=text, metadata={"source": name, "doc_hash": self._digest(text)})
            self._replace(name, doc.metadata["doc_hash"], self.split([doc]), report, rebuild)
        for name in self.names() - set(texts):
            self.store.delete(expr=self._expr(name))
            report.removed.append(name)
        return report

    def chunks(self) -> list[Document]:
        """쌓인 조각 전부 — 파일 이름 · 원래 순서대로."""
        try:
            rows = self.store.search_by_metadata(expr=self.ALL, limit=self.MAX_CHUNKS)
        except Exception:
            return []
        seq = {self._digest(f"{name}|{i}", 32): i for name in {d.metadata.get("source", "") for d in rows} for i in range(len(rows))}
        return sorted(rows, key=lambda d: (d.metadata.get("source", ""), seq.get(d.metadata.get("pk"), len(rows))))

    def names(self) -> set[str]:
        return {d.metadata.get("source", "") for d in self.chunks()}

    def _replace(
        self, name: str, doc_hash: str, chunks: list[Document], report: IndexReport, rebuild: bool = False
    ) -> None:
        stored = None if rebuild else self._stored_hash(name)
        if stored == doc_hash:
            report.skipped.append(name)
            return
        if stored is not None:
            self.store.delete(expr=self._expr(name))
        self.store.add_documents(
            chunks, ids=[self._digest(f"{name}|{i}", 32) for i in range(len(chunks))]
        )
        report.indexed.append(name)
        report.chunks += len(chunks)

    def retriever(self, k: int | None = None):
        return self.store.as_retriever(search_kwargs={"k": k or self.settings.top_k})

    def search(self, query: str, k: int | None = None) -> list[Document]:
        return self.store.similarity_search(query, k=k or self.settings.top_k)

    def is_empty(self) -> bool:
        try:
            return not self.store.search_by_metadata(expr=self.ALL, limit=1)
        except Exception:
            return True

    @staticmethod
    def format(docs: list[Document]) -> str:
        return "\n\n".join(f"[{d.metadata.get('source', '?')}] {d.page_content}" for d in docs)

