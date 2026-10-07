from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from langchain_core.documents import Document
from langchain_milvus import Milvus
from langchain_ollama import OllamaEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import Settings


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
        if self._store is None:
            self._store = self._open()
        return self._store

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
            self._store = self._open(drop_old=True)

        report = IndexReport()
        for doc in documents:
            self._replace(doc.metadata["source"], doc.metadata["doc_hash"], self.split([doc]), report, rebuild)
        return report

    def index_rules(self, name: str, rules: list[str]) -> IndexReport:
        """솔루션 정책 규칙을 적재합니다. rules 는 한 건에 한 줄 (예: PolicyRule.describe()).

        규칙은 몇 줄짜리라 나누지 않습니다. 묶음(name) 단위로 바뀌었는지 보고 통째로 바꿉니다.
        """
        source = self.RULES_PREFIX + name
        doc_hash = self._digest("\n".join(rules))
        chunks = [
            Document(page_content=rule, metadata={"source": source, "doc_hash": doc_hash})
            for rule in rules
        ]
        report = IndexReport()
        self._replace(source, doc_hash, chunks, report)
        return report

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
