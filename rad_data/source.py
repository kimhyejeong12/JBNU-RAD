"""원본 행을 꺼내 오는 소스.

소스는 어디서 읽는지만 맡고, 행을 레코드로 바꾸는 일은 매퍼가 맡습니다.
새 환경은 name 과 rows() 만 갖춘 객체를 만들어 load() 에 넘기면 됩니다.
"""
from __future__ import annotations

import csv
import json
from collections.abc import Iterable, Iterator, Mapping
from pathlib import Path
from typing import Any, Protocol

# 어느 디렉터리에서 실행해도 상대 경로가 같은 파일을 가리키도록 프로젝트 루트를 기준으로 삼습니다.
ROOT = Path(__file__).resolve().parent.parent

Row = dict[str, str]


class RowSource(Protocol):
    name: str

    def rows(self) -> Iterator[tuple[int, Row]]:
        """(위치, 행). 위치는 오류를 원본에서 찾아갈 수 있는 번호입니다 — CSV 는 파일 행 번호, 나머지는 순번."""
        ...


def _clean(row: Mapping[Any, Any]) -> Row:
    # csv.DictReader 는 컬럼보다 값이 많은 행에 None 키를 붙입니다.
    return {
        str(k).strip(): ("" if v is None else str(v).strip())
        for k, v in row.items()
        if k is not None
    }


def _resolve(path: str | Path) -> Path:
    path = Path(path)
    return path if path.is_absolute() else ROOT / path


class CsvSource:
    def __init__(self, path: str | Path, encoding: str = "utf-8-sig", delimiter: str = ",") -> None:
        # utf-8-sig: 엑셀 등에서 저장한 BOM 포함 파일도 첫 컬럼 이름이 깨지지 않습니다.
        self.path = _resolve(path)
        self.encoding = encoding
        self.delimiter = delimiter
        self.name = self.path.name

    def rows(self) -> Iterator[tuple[int, Row]]:
        if not self.path.is_file():
            raise FileNotFoundError(f"데이터 파일이 없습니다: {self.path}")
        with self.path.open(encoding=self.encoding, newline="") as f:
            reader = csv.DictReader(f, delimiter=self.delimiter)
            for row in reader:
                if any((v or "").strip() for v in row.values() if isinstance(v, str)):
                    yield reader.line_num, _clean(row)


class JsonSource:
    """객체 배열 JSON 또는 JSON Lines."""

    def __init__(self, path: str | Path, encoding: str = "utf-8") -> None:
        self.path = _resolve(path)
        self.encoding = encoding
        self.name = self.path.name

    def rows(self) -> Iterator[tuple[int, Row]]:
        if not self.path.is_file():
            raise FileNotFoundError(f"데이터 파일이 없습니다: {self.path}")
        text = self.path.read_text(encoding=self.encoding)
        if self.path.suffix == ".jsonl":
            items = [json.loads(line) for line in text.splitlines() if line.strip()]
        else:
            items = json.loads(text)
            if isinstance(items, dict):
                # API 응답은 {"value": [...]} 처럼 목록을 한 겹 감싸는 경우가 많습니다.
                lists = [v for v in items.values() if isinstance(v, list)]
                if len(lists) != 1:
                    raise ValueError(f"{self.name}: 행 목록을 찾을 수 없습니다")
                items = lists[0]
        for n, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                raise ValueError(f"{self.name}: {n}번째 항목이 객체가 아닙니다")
            yield n, _clean(item)


class MemorySource:
    def __init__(self, rows: Iterable[Mapping[str, Any]], name: str = "memory") -> None:
        self._rows = [_clean(r) for r in rows]
        self.name = name

    def rows(self) -> Iterator[tuple[int, Row]]:
        yield from enumerate(self._rows, start=1)


_FACTORIES: dict[str, Any] = {
    ".csv": CsvSource,
    ".tsv": lambda p: CsvSource(p, delimiter="\t"),
    ".json": JsonSource,
    ".jsonl": JsonSource,
}


def register_source(suffix: str, factory: Any) -> None:
    """확장자에 소스를 연결합니다. factory 는 경로를 받아 소스를 돌려줍니다."""
    _FACTORIES[suffix.lower()] = factory


def open_source(target: Any) -> RowSource:
    """경로면 확장자로 소스를 고르고, 이미 소스면 그대로 돌려줍니다."""
    if hasattr(target, "rows"):
        return target
    path = _resolve(target)
    factory = _FACTORIES.get(path.suffix.lower())
    if factory is None:
        raise ValueError(f"읽을 수 없는 형식입니다: {path.name} (지원: {', '.join(_FACTORIES)})")
    return factory(path)
