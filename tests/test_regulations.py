"""기준 문서 — 원문은 권한 DB 에 두고, RAG 는 그 원문에 맞춰 바뀐 문서만 다시 쌓고 지운 문서는 뺍니다."""
from __future__ import annotations

import re
from types import SimpleNamespace

import pytest

from sentinelai.dev import add_regulations
from sentinelai.db import Denied, regulations
from sentinelai.engine.rag import DocumentStore


def test_only_top_manages_regulations(main_db, people):
    assert regulations.create(main_db, people["top"], "a.md", "가")
    assert not regulations.create(main_db, people["top"], "a.md", "덮어쓰기")
    with pytest.raises(Denied):
        regulations.create(main_db, people["manager"], "b.md", "나")
    regulations.update(main_db, people["top"], "a.md", "가나")
    assert regulations.texts(main_db) == {"a.md": "가나"}
    regulations.restore(main_db, "a.md", "가")
    assert regulations.get(main_db, "a.md")["content"] == "가"
    regulations.delete(main_db, people["top"], "a.md")
    assert regulations.texts(main_db) == {}


def test_import_keeps_existing(main_db, people, tmp_path):
    (tmp_path / "a.md").write_text("새 글", encoding="utf-8")
    (tmp_path / "b.txt").write_text("나", encoding="utf-8")
    (tmp_path / "c.pptx").write_bytes(b"x")
    regulations.create(main_db, people["top"], "a.md", "있던 글")
    assert add_regulations(SimpleNamespace(main_db=main_db), tmp_path) == ["b.txt"]
    assert regulations.texts(main_db) == {"a.md": "있던 글", "b.txt": "나"}


class FakeMilvus:
    """source 로 거르는 식 하나만 알아듣는 흉내입니다."""

    def __init__(self) -> None:
        self.rows: list = []

    def _match(self, expr: str):
        m = re.fullmatch(r'source == "(.*)"', expr)
        return [d for d in self.rows if m is None or d.metadata["source"] == m.group(1)]

    def search_by_metadata(self, expr: str, limit: int):
        return self._match(expr)[:limit]

    def delete(self, expr: str) -> None:
        gone = self._match(expr)
        self.rows = [d for d in self.rows if d not in gone]

    def add_documents(self, docs, ids) -> None:
        self.rows += [type(d)(page_content=d.page_content, metadata={**d.metadata, "pk": i}) for d, i in zip(docs, ids)]


def test_index_follows_db_texts():
    store = DocumentStore(SimpleNamespace(chunk_size=500, chunk_overlap=0))
    store._store = FakeMilvus()
    first = store.index({"a.md": "가", "b.md": "나"})
    assert (first.indexed, first.removed) == (["a.md", "b.md"], [])
    again = store.index({"a.md": "가", "b.md": "나나"})
    assert (again.skipped, again.indexed) == (["a.md"], ["b.md"])
    dropped = store.index({"b.md": "나나"})
    assert dropped.removed == ["a.md"]
    assert [d.page_content for d in store.chunks()] == ["나나"]
