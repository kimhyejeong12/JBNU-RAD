"""RAG 저장소 — 기준 조항(clause)과 솔루션 규칙(rule)을 한 Milvus 컬렉션에 쌓고 종류별로 찾습니다."""
from __future__ import annotations

import hashlib
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from langchain_core.documents import Document
from langchain_core.runnables import Runnable, RunnableParallel
from langchain_milvus import Milvus
from langchain_ollama import OllamaEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

if TYPE_CHECKING:
    from .engine import Engine, Settings


@dataclass
class IndexReport:
    indexed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    chunks: int = 0

    def __str__(self) -> str:
        return (
            f"{len(self.indexed)}개 파일 갱신({self.chunks}청크), "
            f"{len(self.skipped)}개 파일 변경 없음"
        )


class DocumentStore:
    """정책을 담는 Milvus 컬렉션. 두 종류를 한 곳에 쌓습니다.

    - 조항(clause): 사내 기준 문서. 파일을 청크로 나눠 넣습니다.
    - 규칙(rule): 방화벽 · DLP 같은 솔루션 정책. 한 건을 한 청크로 넣고, source 를 "rules:" 로 시작합니다.

    두 종류가 한 top_k 를 나눠 가지면 규칙 건수에 조항이 밀려나므로 검색은 종류별로 합니다.
    해시를 메타데이터로 함께 저장해, 다시 적재할 때 바뀐 것만 임베딩합니다.
    """

    SUFFIXES = {".md", ".txt"}
    RULES_PREFIX = "rules:"
    # 메타데이터 필드를 늘리면 기존 컬렉션 스키마와 맞지 않으므로 종류는 source 접두어로 가립니다.
    KIND_EXPR = {
        "clause": f'not (source like "{RULES_PREFIX}%")',
        "rule": f'source like "{RULES_PREFIX}%"',
    }
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
        # 처음 쓸 때 엽니다. 여러 스레드(자동 감시 · 화면 요청)가 동시에 열면 Milvus Lite 가 같은 프로세스에서
        # 잠금을 두 번 잡으려다 "Open local milvus failed" 로 실패하므로 한 번에 하나만 엽니다.
        with self._lock:
            if self._store is None:
                self._store = self._open()
            return self._store

    def close(self) -> None:
        """연결을 닫고 Milvus Lite 서버를 멈춰 DB 잠금을 풉니다. 다음에 쓰면 다시 엽니다."""
        with self._lock:
            if self._store is None:
                return
            self._store.client.close()
            self._store = None
            if not self.settings.milvus_is_server:
                # 클라이언트를 닫아도 같은 프로세스의 Milvus Lite 서버가 잠금을 쥐고 있어, 서버까지 멈춰야 풀립니다.
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

    def read(self, source: str | Path) -> list[Document]:
        root = Path(source)
        files = (
            [root]
            if root.is_file()
            else sorted(p for p in root.rglob("*") if p.suffix.lower() in self.SUFFIXES)
        )
        if not files:
            raise FileNotFoundError(
                f"읽을 문서가 없습니다: {root} (지원 확장자: {', '.join(sorted(self.SUFFIXES))})"
            )
        documents = []
        for f in files:
            text = f.read_text(encoding="utf-8")
            documents.append(
                Document(
                    page_content=text,
                    metadata={"source": f.name, "doc_hash": self._digest(text)},
                )
            )
        return documents

    def split(self, docs: list[Document]) -> list[Document]:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        return splitter.split_documents(docs)

    def index(self, source: str | Path, rebuild: bool = False) -> IndexReport:
        """기준 문서를 적재합니다. 바뀐 파일만 다시 임베딩하고, rebuild 면 컬렉션을 비우고 전부 새로 (규칙도 지워짐)."""
        documents = self.read(source)
        if rebuild:
            with self._lock:
                self._store = self._open(drop_old=True)

        report = IndexReport()
        for doc in documents:
            self._replace(doc.metadata["source"], doc.metadata["doc_hash"], self.split([doc]), report, rebuild)
        return report

    def index_rules(self, name: str, rules: list[str]) -> IndexReport:
        """솔루션 정책 규칙을 적재합니다. rules 는 한 건에 한 줄 (예: PolicyRule.describe()).

        규칙은 몇 줄짜리라 나누지 않습니다. 묶음(name) 단위로 바뀌었는지 보고 통째로 바꿉니다.
        규칙 묶음은 하나만 둡니다. 정책 파일 · 폴더를 바꾸면 예전 묶음의 규칙이 검색에 섞이지 않게 지웁니다.
        """
        source = self.RULES_PREFIX + name
        doc_hash = self._digest("\n".join(rules))
        chunks = [
            Document(page_content=rule, metadata={"source": source, "doc_hash": doc_hash})
            for rule in rules
        ]
        report = IndexReport()
        self._replace(source, doc_hash, chunks, report)
        stale = self.KIND_EXPR["rule"] + " and not (" + self._expr(source) + ")"
        if self.store.search_by_metadata(expr=stale, limit=1):
            self.store.delete(expr=stale)
        return report

    def clear_rules(self) -> bool:
        """솔루션 정책 규칙을 모두 지웁니다 (정책 폴더가 비었을 때). 지운 게 있으면 True"""
        if not self.store.search_by_metadata(expr=self.KIND_EXPR["rule"], limit=1):
            return False
        self.store.delete(expr=self.KIND_EXPR["rule"])
        return True

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

    def _search_kwargs(self, k: int | None, kind: str | None) -> dict:
        kwargs: dict = {"k": k or self.settings.top_k}
        if kind:
            kwargs["expr"] = self.KIND_EXPR[kind]
        return kwargs

    def retriever(self, k: int | None = None, kind: str | None = None):
        """kind: "clause" · "rule" · None(전부)."""
        return self.store.as_retriever(search_kwargs=self._search_kwargs(k, kind))

    def search(self, query: str, k: int | None = None, kind: str | None = None) -> list[Document]:
        return self.store.similarity_search(query, **self._search_kwargs(k, kind))

    def is_empty(self) -> bool:
        try:
            return not self.store.search_by_metadata(expr="pk != ''", limit=1)
        except Exception:
            return True

    @staticmethod
    def format(docs: list[Document]) -> str:
        return "\n\n".join(f"[{d.metadata.get('source', '?')}] {d.page_content}" for d in docs)


# --- 체인이 쓰는 검색 단계 (질의 문자열 → 프롬프트에 넣을 근거 텍스트) ---------------------


def lookup(engine: Engine, k: int | None, kind: str) -> Runnable[str, str]:
    """한 종류(clause · rule)만 찾습니다."""
    return engine.documents.retriever(k, kind) | DocumentStore.format


def lookup_all(engine: Engine, k: int | None) -> Runnable[str, str]:
    """조항과 규칙을 따로 찾아 이어 붙입니다. 한 번에 찾으면 규칙에 조항이 밀려나기 때문입니다."""
    both = RunnableParallel(clause=lookup(engine, k, "clause"), rule=lookup(engine, k, "rule"))
    return both | (lambda found: "\n\n".join(text for text in found.values() if text))

