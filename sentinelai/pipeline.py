"""데이터 계층(sentinelai.data)과 엔진(sentinelai.engine)을 잇는 실행 흐름.

data 와 engine 은 서로를 가져오지 않습니다. 둘을 함께 쓰는 흐름은 여기에만 둡니다.

    from sentinelai.engine import Engine
    from sentinelai import pipeline

    engine = Engine()
    pipeline.index_policies(engine, "data/policies.csv")      # 정책 이해 · 로그 감시가 함께 쓰는 규칙 적재
    run = pipeline.monitor(engine, "logs.csv", since=last_run)  # 로그 감시 1회
"""
from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from . import ROOT
from .data import LoadResult, event_review_input, group_by_user, latest, load_events, load_policies, parse_datetime
from .engine import Engine, IndexReport, Verdict

RETRIES = 2


def attempt(call: Callable[[], Any], retries: int = RETRIES) -> tuple[Any | None, str | None, float]:
    """call() 을 최대 retries+1 회 시도합니다. → (결과 또는 None, 마지막 실패 원인, 소요 초)"""
    started = time.time()
    error = None
    for _ in range(retries + 1):
        try:
            return call(), None, time.time() - started
        except Exception as exc:  # 구조화 출력 파싱 실패 · 연결 오류 모두 다시 시도합니다.
            error = f"{type(exc).__name__}: {exc}"
    return None, error, time.time() - started


def index_policies(engine: Engine, source: Any) -> tuple[LoadResult, IndexReport]:
    """솔루션 정책 규칙을 RAG 에 적재합니다. 바뀌지 않았으면 건너뜁니다."""
    loaded = load_policies(source)
    if not loaded.records:
        raise ValueError(f"{loaded.source}: 적재할 정책이 없습니다")
    report = engine.documents.index_rules(loaded.source, [r.describe() for r in loaded.records])
    return loaded, report


@dataclass
class Finding:
    """사용자 한 명의 로그 묶음 판정."""

    user: str
    subject: str
    events: str
    verdict: Verdict | None
    error: str | None
    elapsed_sec: float

    def to_dict(self) -> dict[str, Any]:
        base = {"user": self.user, "subject": self.subject, "events": self.events, "elapsed_sec": self.elapsed_sec}
        if self.verdict is None:
            return {**base, "failed": True, "error": self.error}
        return {**base, **self.verdict.model_dump(), "failed": False}


@dataclass
class MonitorRun:
    loaded: LoadResult
    findings: list[Finding] = field(default_factory=list)
    last_event_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source": self.loaded.source,
            "last_event_at": self.last_event_at.isoformat() if self.last_event_at else None,
            "issues": [str(i) for i in self.loaded.issues],
            "findings": [f.to_dict() for f in self.findings],
        }


def monitor(
    engine: Engine,
    source: Any,
    since: datetime | None = None,
    until: datetime | None = None,
    on_finding: Callable[[Finding], None] | None = None,
) -> MonitorRun:
    """로그 감시 1회 — 읽기 → 시각 필터 → 사용자별 묶기 → event_chain 판정.

    판정 한 건에 수십 초~수 분이 걸리므로, 끝날 때마다 on_finding 으로 넘겨 진행을 보여줄 수 있게 합니다.
    """
    run = MonitorRun(loaded=load_events(source, since=since, until=until))
    if not run.loaded.records:
        return run
    chain = engine.event_chain()
    for user, events in group_by_user(run.loaded.records).items():
        inputs = event_review_input(events)
        verdict, error, elapsed = attempt(lambda: chain.invoke(inputs))
        finding = Finding(user, inputs["subject"], inputs["events"], verdict, error, round(elapsed, 1))
        run.findings.append(finding)
        # 알림(engine/alert.py 의 Notifier)을 구축하면 주의 · 위험 판정을 여기서 보냅니다.
        if on_finding:
            on_finding(finding)
    run.last_event_at = latest(run.loaded.records)
    return run


class Watermark:
    """마지막으로 판정한 로그 시각을 파일에 남겨, 주기 실행(cron 등)이 같은 로그를 두 번 판정하지 않게 합니다."""

    def __init__(self, path: str | Path) -> None:
        path = Path(path)
        self.path = path if path.is_absolute() else ROOT / path

    def load(self) -> datetime | None:
        if not self.path.is_file():
            return None
        text = self.path.read_text(encoding="utf-8").strip()
        return parse_datetime(text) if text else None

    def save(self, moment: datetime) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(moment.isoformat() + "\n", encoding="utf-8")
