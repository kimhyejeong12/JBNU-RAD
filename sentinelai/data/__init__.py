"""검토 대상 데이터 계층 — 소스 × 매퍼. 엔진을 가져오지 않습니다."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from .collected import changes as snapshot_changes, load_collected, server_digest, snapshot_from_payload
from .suspect import band as suspect_band, behavior_signals, suspect_people
from .events import PERIODS, between, event_review_input, group_by_user, latest, period_since, search, summarize, user_label, vocabulary
from .mapper import AccessRequestMapper, ColumnMapper, EventMapper, Mapper, PolicyRuleMapper, ServerStateMapper, parse_datetime
from .servers import rules_for, server_review_input
from .source import CsvSource, JsonSource, MemorySource, Row, RowSource, folder_files, open_source, register_source
from .types import AccessRequest, LoadIssue, LoadResult, PolicyRule, Record, SecurityEvent, ServerSnapshot, ServerState


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


def load_events(
    target: Any,
    mapper: EventMapper | None = None,
    strict: bool = False,
    since: datetime | None = None,
    until: datetime | None = None,
) -> LoadResult:
    """범위 밖 로그는 오류가 아니므로 issues 에 넣지 않습니다."""
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
    "PERIODS",
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
    "ServerSnapshot",
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
    "load_collected",
    "parse_datetime",
    "period_since",
    "register_source",
    "search",
    "server_digest",
    "snapshot_changes",
    "behavior_signals",
    "suspect_band",
    "suspect_people",
    "snapshot_from_payload",
    "summarize",
    "user_label",
    "vocabulary",
]
