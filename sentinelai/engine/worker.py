"""워커 — 큐에서 잡을 하나씩 꺼내 규정 RAG 를 찾고, 프롬프트 모듈로 입력을 쓰고, 생각 설정대로 모델을 돌려 저장합니다. 모델 · 벡터 DB 는 워커만 칩니다."""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Protocol

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable
from pydantic import BaseModel, Field

from .. import ROOT
from ..context import Built, Prompts
from ..db import permissions, results
from .queue import Batch, Job, Queues
from .rag import IndexReport
from .resource import Resources

log = logging.getLogger(__name__)

DOCS_DIR = ROOT / "docs"
RETRIES = 2
BANDS = ((70, "높음"), (40, "보통"))


# --- 판정 출력 타입 — docstring · Field 설명이 모델에 그대로 들어갑니다 ---

RiskLevel = Literal["정상", "주의", "위험"]


class Verdict(BaseModel):
    """접근 권한 신청 한 건에 대한 판단."""

    level: RiskLevel = Field(description="위험 등급")
    reason: str = Field(description="그렇게 판단한 이유")
    sources: list[str] = Field(description="근거로 삼은 기준 문서 식별자 목록")
    recommendation: str = Field(description="개선안 또는 권고 조치")


class ServerGap(BaseModel):
    """서버의 지금 상태가 기준 문서와 다른 곳 한 군데와, 맞추려면 바꿀 것."""

    item: str = Field(description="어긋난 설정 이름 (예: permitrootlogin, 관리자 계정)")
    current: str = Field(description="지금 상태 — 수집한 값 그대로")
    required: str = Field(description="기준 문서가 요구하는 상태")
    source: str = Field(description="근거 조항 — 기준 문서 이름과 조항 번호 (예: 정책_운영기준.md 6.2)")
    level: RiskLevel = Field(description="이 차이의 위험 등급")
    change: str = Field(description="기준에 맞추려면 이 환경에서 바꿀 것 — 설정 · 계정 등 구체적 조치")


class ServerReview(BaseModel):
    """서버 한 대의 수집한 상태를 기준 문서와 비교한 결과."""

    level: RiskLevel = Field(description="서버 전체 위험 등급 — 차이가 없으면 정상")
    gaps: list[ServerGap] = Field(description="기준 문서와 다른 곳 목록. 없으면 빈 목록")
    unjudged: list[str] = Field(description="다루는 조항이 없어 판단하지 않은 현황 항목 이름. 없으면 빈 목록")
    summary: str = Field(description="한두 문장 요약")


class SuspectScore(BaseModel):
    """사용자 한 명의 의심 점수 — 앞으로 보안 위협이 될 가능성. 판정이 아니라 먼저 살펴볼 사람을 고르는 예측입니다."""

    score: int = Field(ge=0, le=100, description="의심 점수 0~100. 높을수록 위협 가능성이 크다")
    reason: str = Field(description="그 점수가 나온 이유 — 어떤 행동 신호 · 기록 때문인지")
    watch: str = Field(description="보안 운영자가 확인할 점")


class PolicyIssue(BaseModel):
    """기준 문서에서 발견된 문제 한 건."""

    kind: Literal["중복", "충돌", "과도한 허용"] = Field(description="문제 유형")
    level: RiskLevel = Field(description="위험 등급")
    policy_ids: list[str] = Field(description="관련 조항 (문서 이름과 조항 번호, 예: 정책_운영기준.md 6.1)")
    reason: str = Field(description="문제라고 본 이유")
    recommendation: str = Field(description="개선안")


class PolicyReview(BaseModel):
    """기준 문서 검토 결과 전체."""

    issues: list[PolicyIssue] = Field(description="발견된 문제 목록. 없으면 빈 목록")
    summary: str = Field(description="검토 요약")


class Notifier(Protocol):
    """로그 감시의 주의 · 위험을 운영자에게 알리는 자리입니다 (아직 구현 없음)."""

    def send(self, subject: str, verdict: Verdict, evidence: str) -> None:
        """subject: 대상 사용자, evidence: 판정에 쓴 로그 (한 줄에 한 건)."""
        ...


@dataclass(frozen=True)
class Judgment:
    prompt: ChatPromptTemplate
    schema: type[BaseModel]
    think: bool = True


# 잡 종류마다 프롬프트 · 출력 타입 · 생각 단계. 빠른 감시만 생각을 끕니다 (빠르지만 덜 정확해 1차 판정용).
JUDGMENTS = {
    "request": Judgment(Prompts.ACCESS_REVIEW, Verdict),
    "grant": Judgment(Prompts.GRANT_REVIEW, Verdict),
    "events": Judgment(Prompts.EVENT_REVIEW, Verdict),
    "events_fast": Judgment(Prompts.EVENT_REVIEW, Verdict, think=False),
    "suspects": Judgment(Prompts.SUSPECT, SuspectScore),
    "nodes": Judgment(Prompts.SERVER_REVIEW, ServerReview),
    "policies": Judgment(Prompts.POLICY_CONFLICT, PolicyReview),
}


class Cancelled(Exception):
    """취소 · 강제 중지 · 종료된 잡 — 결과를 쓰지 않습니다."""


def attempt(call: Callable[[], Any], retries: int = RETRIES) -> tuple[Any | None, str | None, float]:
    """→ (결과 또는 None, 마지막 실패 원인, 소요 초)"""
    started = time.time()
    error = None
    for _ in range(retries + 1):
        try:
            return call(), None, time.time() - started
        except Exception as exc:  # 구조화 출력 파싱 실패 · 연결 오류 모두 다시 시도합니다.
            error = f"{type(exc).__name__}: {exc}"
    return None, error, time.time() - started


def band(score: int) -> str:
    """모델이 적은 등급 대신 점수로 정해 둘이 어긋나지 않게 합니다."""
    return next((name for floor, name in BANDS if score >= floor), "낮음")


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class Worker:
    def __init__(self, resources: Resources, queues: Queues) -> None:
        self.res = resources
        self.queues = queues
        self._chains: dict[str, Runnable[dict[str, Any], Any]] = {}

    # --- 돌리기 ---

    def start(self) -> None:
        """새 세대의 워커 스레드를 띄웁니다 (강제 중지 뒤에도)."""
        generation = self.queues.generation
        threading.Thread(target=self._loop, args=(generation,), daemon=True, name=f"worker-{generation}").start()

    def _loop(self, generation: int) -> None:
        while (job := self.queues.take(generation)) is not None:
            self.run(job, generation)

    def drain(self) -> None:
        """큐가 빌 때까지 이 자리에서 돌립니다 (CLI)."""
        generation = self.queues.generation
        while (job := self.queues.take(generation, block=False)) is not None:
            self.run(job, generation)

    def run(self, job: Job, generation: int) -> None:
        status, error, result = "done", None, None
        try:
            result = self._do(job, generation)
        except Cancelled:
            status, error = "cancelled", "취소했습니다"
        except Exception as exc:  # 파일 없음 · DB 오류 등은 화면에 그대로 보여줍니다.
            log.exception("잡 %s 이 실패했습니다", job.key)
            status, error = "failed", f"{type(exc).__name__}: {exc}"
        self.queues.finish(job, generation, status, error, result)

    def _do(self, job: Job, generation: int) -> Any:
        if job.work is not None:
            return job.work()
        if job.close:
            return getattr(self, f"_close_{job.kind}")(job.batch)
        if "error" in job.data:
            result = {"failed": True, "error": job.data["error"], "elapsed_sec": 0.0, "input": None}
        else:
            result = self.judge(job.kind, job.data, job.batch)
        if not self.queues.live(job, generation):
            raise Cancelled
        return getattr(self, f"_save_{job.kind}")(job.data, result, job.batch)

    # --- 판정 ---

    def _chain(self, kind: str) -> Runnable[dict[str, Any], Any]:
        if kind not in self._chains:
            j = JUDGMENTS[kind]
            self._chains[kind] = self.res.chain(j.prompt, j.schema, j.think)
        return self._chains[kind]

    def index(self, source: Any = None, rebuild: bool = False) -> IndexReport:
        """바뀐 파일만 적재하고, 폴더에 없는 파일의 조각은 뺍니다."""
        return self.res.documents.index(source or DOCS_DIR, rebuild=rebuild)

    def _built(self, kind: str, d: dict[str, Any], batch: Batch | None) -> Built:
        """규정 RAG 검색 → 프롬프트 모듈. 서버 점검 · 정책 관리 검토는 묶음마다 처음에 기준 문서를 RAG 에 맞춥니다."""
        regs, inputs = self.res.sources.regulations, self.res.inputs
        if kind in ("nodes", "policies") and batch is not None and not batch.context.get("indexed"):
            self.index()
            batch.context["indexed"] = True
        if kind == "request":
            return inputs.request(d["row"], d["person"], regs.for_request(d["row"]))
        if kind == "grant":
            return inputs.grant(d["row"], d["person"], regs.for_grant(d["row"]))
        if kind in ("events", "events_fast"):
            return inputs.events(d["events"], d["person"], regs.for_events(d["events"]), kind == "events_fast")
        if kind == "suspects":
            return inputs.suspect(d["info"], d["person"], regs.for_suspect(d["info"]))
        if kind == "nodes":
            snap, changes = d["row"]["snapshot"], d["row"]["changes"]
            return inputs.server(snap, changes, regs.for_server(snap, changes), d["decided"])
        return inputs.policy(regs.everything(), d["decided"])

    def judge(self, kind: str, data: dict[str, Any], batch: Batch | None = None) -> dict[str, Any]:
        """판정 실패는 failed · error 로 남깁니다. input(글자 수 · 한도 · 뺀 줄)은 저장하지 않습니다."""
        chain, built = self._chain(kind), self._built(kind, data, batch)
        verdict, error, elapsed = attempt(lambda: chain.invoke(built.inputs))
        if built.trimmed:
            log.info("판정 입력 %s자 (한도 %s자) — 줄인 칸 %s", built.chars, built.limit, built.trimmed)
        base = {"failed": verdict is None, "error": error, "elapsed_sec": round(elapsed, 1)}
        result = {**(verdict.model_dump() if verdict is not None else {}), **base,
                  "input": {"chars": built.chars, "limit": built.limit, "trimmed": built.trimmed}}
        if kind == "suspects" and verdict is not None:
            result["level"] = band(result["score"])
        return result

    def _model(self, kind: str) -> str:
        return self.res.settings.model + ("" if JUDGMENTS[kind].think else " (생각 끔)")

    # --- 저장 (판정 한 건) — 돌려준 값이 묶음의 items · 진행 보고로 갑니다 ---

    def _save_request(self, d: dict[str, Any], result: dict[str, Any], _batch: Batch | None) -> dict[str, Any]:
        if not permissions.save_ai_verdict(self.res.main_db, d["request_no"], result, self._model("request")):
            log.info("권한 신청 %s 은 판정 중에 1차 결재가 나서 판정을 버립니다", d["request_no"])
        return result

    def _save_grant(self, d: dict[str, Any], result: dict[str, Any], _batch: Batch | None) -> dict[str, Any]:
        if not permissions.save_grant_review(self.res.main_db, d["request_no"], d["move_id"], result, self._model("grant")):
            log.info("보유 권한 %s 은 재검토 중에 회수 · 만료되어 판정을 버립니다", d["request_no"])
        return result

    def _save_events(self, d: dict[str, Any], result: dict[str, Any], _batch: Batch | None) -> dict[str, Any]:
        """로그 감시는 닫기 잡이 묶음째 저장합니다 (다음 감시 시작점과 함께)."""
        # 알림(Notifier)을 붙이면 여기서 보냅니다.
        return {**d["finding"], **result}

    _save_events_fast = _save_events

    def _save_nodes(self, d: dict[str, Any], result: dict[str, Any], _batch: Batch | None) -> dict[str, Any]:
        row = d["row"]
        finding = {"node": row["node"], "snapshot_id": row["id"], "host": row["host"], "ip": row["ip"], **result}
        results.save_node_finding(self.res.results_db, finding, self._model("nodes"))
        return finding

    def _save_suspects(self, d: dict[str, Any], result: dict[str, Any], _batch: Batch | None) -> dict[str, Any]:
        results.save_suspect(self.res.results_db, d["info"], result, self._model("suspects"))
        return {"key": d["info"]["key"], **result}

    def _save_policies(self, _d: dict[str, Any], result: dict[str, Any], batch: Batch | None) -> dict[str, Any]:
        review = {"generated_at": _now(), "source": "RAG 기준 문서", "load_issues": [], "rules": [], **result}
        results.save_policy_review(self.res.results_db, review, self._model("policies"))
        if batch is not None:
            batch.context["review"] = review
        return result

    # --- 묶음 닫기 ---

    def _close_events(self, batch: Batch) -> dict[str, Any]:
        c = batch.context
        run = {"generated_at": _now(), "source": c["source"], "load_issues": c["load_issues"],
               "last_event_at": c["last_event_at"], "findings": batch.items}
        stage = "fast" if batch.kind == "events_fast" else "final"
        results.save_monitor_run(self.res.results_db, run, self._model(batch.kind), c["since"], c["until"], stage)
        return {**run, "since": c["since"]}

    _close_events_fast = _close_events

    def _close_nodes(self, batch: Batch) -> dict[str, Any]:
        return {"findings": batch.items, "load_issues": []}

    def _close_suspects(self, batch: Batch) -> dict[str, Any]:
        return {"people": batch.items}

    def _close_policies(self, batch: Batch) -> dict[str, Any] | None:
        return batch.context.get("review")


__all__ = ["DOCS_DIR", "JUDGMENTS", "Notifier", "PolicyIssue", "PolicyReview", "RiskLevel", "ServerGap", "ServerReview",
           "SuspectScore", "Verdict", "Worker", "attempt", "band"]
