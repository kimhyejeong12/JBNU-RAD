"""검토 대상 데이터 계층 — 소스(어디서 읽나) × 매퍼(어떤 레코드로 바꾸나).

엔진(sentinelai.engine)을 가져오지 않습니다. 엔진 · 웹 · 스크립트가 같은 레코드 타입을 나눠 씁니다.

    from sentinelai.data import event_review_input, group_by_user, load_events, load_requests

    for event in load_events("data/솔루션 별 Mock 데이터.csv").records:
        print(event.describe())

    request = load_requests("data/permissions.csv").records[0]
    engine.review_chain().invoke(request.review_input())

    events = load_events("data/솔루션 별 Mock 데이터.csv", since=last_run).records
    for group in group_by_user(events).values():
        engine.event_chain().invoke(event_review_input(group))

새 환경은 name · rows() 를 갖춘 소스를 넘기고, 컬럼 이름만 다르면 매퍼의 columns 를 덮어씁니다.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from .events import between, event_review_input, group_by_user, latest, search, summarize, vocabulary
from .mapper import AccessRequestMapper, ColumnMapper, EventMapper, Mapper, PolicyRuleMapper, ServerStateMapper, parse_datetime
from .servers import rules_for, server_review_input
from .source import CsvSource, JsonSource, MemorySource, Row, RowSource, folder_files, open_source, register_source
from .types import AccessRequest, LoadIssue, LoadResult, PolicyRule, Record, SecurityEvent, ServerState


def load(target: Any, mapper: Mapper, strict: bool = False) -> LoadResult:
    """target: 파일 경로 · 폴더 경로 또는 소스.

    필수 컬럼이 없으면 파일을 잘못 고른 것이므로 바로 ValueError 를 냅니다.
    행 오류는 issues 에 모으고, strict=True 면 첫 행 오류에서 멈춥니다.
    폴더면 안의 파일(.csv · .json 등)을 모두 읽어 합칩니다. 비어 있으면 레코드 없이 돌려줍니다.
    """
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
    # 솔루션마다 내보낸 파일을 한 폴더에 모으므로, 컬럼이 맞지 않는 파일 하나 때문에 나머지를 버리지 않습니다.
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


def load_events(
    target: Any,
    mapper: EventMapper | None = None,
    strict: bool = False,
    since: datetime | None = None,
    until: datetime | None = None,
) -> LoadResult:
    """since · until 은 between() 과 같습니다. 범위 밖 로그는 오류가 아니므로 issues 에 넣지 않습니다."""
    result = load(target, mapper or EventMapper(), strict)
    if since or until:
        result.records = between(result.records, since, until)
    return result


def load_requests(target: Any, mapper: AccessRequestMapper | None = None, strict: bool = False) -> LoadResult:
    return load(target, mapper or AccessRequestMapper(), strict)


def load_policies(target: Any, mapper: PolicyRuleMapper | None = None, strict: bool = False) -> LoadResult:
    return load(target, mapper or PolicyRuleMapper(), strict)


def load_servers(target: Any, mapper: ServerStateMapper | None = None, strict: bool = False) -> LoadResult:
    return load(target, mapper or ServerStateMapper(), strict)


__all__ = [
    "AccessRequest",
    "AccessRequestMapper",
    "ColumnMapper",
    "CsvSource",
    "EventMapper",
    "JsonSource",
    "LoadIssue",
    "LoadResult",
    "Mapper",
    "MemorySource",
    "PolicyRule",
    "PolicyRuleMapper",
    "Record",
    "Row",
    "RowSource",
    "SecurityEvent",
    "ServerState",
    "ServerStateMapper",
    "between",
    "event_review_input",
    "folder_files",
    "group_by_user",
    "latest",
    "load",
    "load_events",
    "load_policies",
    "load_requests",
    "load_servers",
    "rules_for",
    "server_review_input",
    "open_source",
    "parse_datetime",
    "register_source",
    "search",
    "summarize",
    "vocabulary",
]
