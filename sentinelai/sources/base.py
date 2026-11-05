"""모든 데이터 종류가 함께 쓰는 바탕 — 레코드 · 읽은 결과 · 행 소스(CSV · JSON · 메모리) · 컬럼 매핑 · 읽기."""
from __future__ import annotations

import csv
import json
import re
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel

from .. import ROOT

Row = dict[str, str]


class Record(BaseModel):
    # 판정 근거를 원본까지 거슬러 올라갈 수 있게 원본 행을 함께 둡니다.
    raw: dict[str, str] = {}


@dataclass
class LoadIssue:
    line: int
    message: str

    def __str__(self) -> str:
        # 0행은 파일 전체의 문제입니다.
        return f"{self.line}행: {self.message}" if self.line else self.message


@dataclass
class LoadResult:
    source: str
    records: list = field(default_factory=list)
    # 한 행이 깨져도 나머지는 쓸 수 있게 예외 대신 모아 둡니다.
    issues: list[LoadIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues

    def __str__(self) -> str:
        return f"{self.source}: {len(self.records)}건 읽음, 실패 {len(self.issues)}건"


class RowSource(Protocol):
    """새 환경은 name 과 rows() 만 갖춘 객체를 넘기면 됩니다."""

    name: str

    def rows(self) -> Iterator[tuple[int, Row]]:
        """(위치, 행). 위치는 CSV 면 파일 행 번호, 나머지는 순번입니다."""
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
        # utf-8-sig 라야 BOM 포함 파일의 첫 컬럼 이름이 깨지지 않습니다.
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
    """factory 는 경로를 받아 소스를 돌려줍니다."""
    _FACTORIES[suffix.lower()] = factory


def folder_files(target: Any) -> list[Path] | None:
    """폴더 안의 읽을 수 있는 파일 (이름 순, 하위 폴더 제외). 폴더가 아니면 None"""
    if hasattr(target, "rows"):
        return None
    path = _resolve(target)
    if not path.is_dir():
        return None
    return sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() in _FACTORIES)


def open_source(target: Any) -> RowSource:
    if hasattr(target, "rows"):
        return target
    path = _resolve(target)
    if not path.suffix and not path.exists():
        raise FileNotFoundError(f"데이터 폴더가 없습니다: {path}")
    factory = _FACTORIES.get(path.suffix.lower())
    if factory is None:
        raise ValueError(f"읽을 수 없는 형식입니다: {path.name} (지원: {', '.join(_FACTORIES)})")
    return factory(path)


# 한국어 로캘로 내보낸 CSV 는 "2026. 10. 6. 오전 2:47:00.000" 처럼 적힙니다.
_KO_DATETIME = re.compile(
    r"^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?$"
)


def parse_datetime(value: str) -> datetime:
    """한국어 로캘 표기 또는 ISO 8601 → UTC datetime."""
    m = _KO_DATETIME.match(value)
    if m:
        y, mo, d, ampm, h, mi, s, frac = m.groups()
        hour = int(h) % 12 + (12 if ampm == "오후" else 0)
        micro = int((frac or "0").ljust(6, "0"))
        parsed = datetime(int(y), int(mo), int(d), hour, int(mi), int(s or 0), micro)
    else:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError(f"날짜 · 시각 형식이 아닙니다: {value!r}") from None
    # TimeGenerated 는 UTC 라서 시간대 표기가 없으면 UTC 로 봅니다.
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class Mapper(Protocol):
    def check(self, columns: Sequence[str]) -> None:
        """필수 컬럼이 없으면 ValueError."""
        ...

    def map(self, row: Row) -> Record:
        """값이 잘못된 행은 ValueError."""
        ...


Columns = Mapping[str, Sequence[str]]


class ColumnMapper:
    """COLUMNS(필드 → 후보 컬럼 이름, 앞에서부터 찾음)로 행을 읽습니다. REQUIRED 밖의 필드는 비어도 됩니다."""

    COLUMNS: Columns = {}
    REQUIRED: frozenset[str] = frozenset()

    def __init__(self, columns: Columns | None = None) -> None:
        """columns: 이름이 다른 필드만 덮어씁니다."""
        self.columns = {**self.COLUMNS, **(columns or {})}
        self.required = set(self.REQUIRED)

    def check(self, columns: Sequence[str]) -> None:
        missing = [
            " / ".join(names)
            for f, names in self.columns.items()
            if f in self.required and not any(name in columns for name in names)
        ]
        if missing:
            raise ValueError(f"컬럼이 없습니다: {', '.join(missing)}")

    def known_columns(self) -> set[str]:
        return {name for names in self.columns.values() for name in names}

    def get(self, row: Row, field: str) -> str:
        for name in self.columns[field]:
            if name in row:
                if not row[name] and field in self.required:
                    raise ValueError(f"{name} 값이 비어 있습니다")
                return row[name]
        return ""


def load(target: Any, mapper: Mapper, strict: bool = False) -> LoadResult:
    """필수 컬럼이 없으면 ValueError. 행 오류는 issues 에 모으고, strict 면 첫 행 오류에서 멈춥니다."""
    files = folder_files(target)
    if files is not None:
        return _load_folder(Path(str(target)), files, mapper, strict)
    source = open_source(target)
    result = LoadResult(source=source.name)
    checked = False
    for line, row in source.rows():
        if not checked:
            try:
                mapper.check(list(row))
            except ValueError as exc:
                raise ValueError(f"{source.name}: {exc}") from None
            checked = True
        try:
            result.records.append(mapper.map(row))
        except ValueError as exc:  # pydantic 의 ValidationError 도 여기로 옵니다.
            if strict:
                raise ValueError(f"{source.name} {line}행: {exc}") from None
            result.issues.append(LoadIssue(line, str(exc)))
    return result


def _load_folder(folder: Path, files: list[Path], mapper: Mapper, strict: bool) -> LoadResult:
    # 컬럼이 맞지 않는 파일 하나 때문에 폴더의 나머지 파일을 버리지 않습니다.
    result = LoadResult(source=folder.name)
    for path in files:
        try:
            part = load(path, mapper, strict)
        except ValueError as exc:
            if strict:
                raise
            result.issues.append(LoadIssue(0, str(exc)))
            continue
        result.records += part.records
        result.issues += [LoadIssue(i.line, f"{path.name} {i.message}") for i in part.issues]
    return result


def optional(loader: Any, source: Any) -> LoadResult:
    """폴더 · 파일이 없으면 건너뛰고, 그 사실은 읽기 실패로 남깁니다."""
    try:
        return loader(source)
    except FileNotFoundError as exc:
        return LoadResult(source=Path(str(source)).name, issues=[LoadIssue(0, str(exc))])
