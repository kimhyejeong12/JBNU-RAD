"""SentinelAI 엔진 — 설정 · 모델 · RAG 저장소 · 두 DB · 작업 큐를 한곳에서 엽니다.

웹(sentinelai.web)과 CLI(sentinelai.cli)는 Engine 하나를 만들어 여기 기능을 부릅니다.
판정 흐름(체인 · 데이터 → 체인)은 pipeline.py, 저장 형식은 sentinelai.db 에 있습니다.

    engine = Engine()
    engine.run_policies()                 # 정책 관리 검토 (문서 · 규칙 적재 포함)
    engine.start() … engine.stop()        # 웹: 자동 로그 감시 · 서버 점검 · 권한 신청 판정 큐
"""
from __future__ import annotations

import logging
import os
import queue
import threading
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, fields
from datetime import datetime, timedelta, timezone
from functools import cached_property
from pathlib import Path
from typing import Any

import ollama
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable
from langchain_ollama import ChatOllama
from pydantic import BaseModel

from .. import ROOT
from ..data import LoadResult, behavior_signals, load_collected, load_events, period_since, suspect_people
from ..data.collected import FORMAT
from ..db import Database, User, auth, nodes, open_main_db, open_results_db, permissions, results
from . import pipeline
from .rag import DocumentStore, IndexReport
from .types import Answer

log = logging.getLogger(__name__)

CASTS = {"str": str, "int": int, "float": float}
#: pymilvus 가 python-dotenv 로 .env 를 주입하기 전의 환경변수.
BOOT_ENV = dict(os.environ)

Progress = Callable[[int, int, dict[str, Any]], None]


# --- 설정 --------------------------------------------------------------------


@dataclass(frozen=True)
class Settings:
    """`.env` 또는 SENTINELAI_ 환경변수에서 읽는 설정. 코드에 기본값은 없습니다."""

    PREFIX = "SENTINELAI_"

    ollama_base_url: str
    model: str
    qa_model: str
    embedding_model: str
    temperature: float
    num_ctx: int
    num_predict: int
    keep_alive: str
    milvus_uri: str
    milvus_collection: str
    chunk_size: int
    chunk_overlap: int
    top_k: int
    policies_source: str
    servers_source: str
    events_source: str
    db_path: str
    results_db_path: str
    monitor_interval_min: int
    fast_interval_min: str

    #: 비워 둬도 되는 설정. fast_interval_min 을 적으면 로그 감시가 둘이 됩니다 — 그 간격마다 생각 단계를 끈 판정 모델로
    #: 빠른 감시(1차 판정), monitor_interval_min 마다 생각하는 판정 모델로 정밀 감시(확정).
    OPTIONAL = frozenset({"fast_interval_min"})

    @staticmethod
    def env_file() -> Path:
        return Path(os.environ.get("SENTINELAI_ENV_FILE", ROOT / ".env"))

    @classmethod
    def _from_file(cls) -> dict[str, str]:
        path = cls.env_file()
        if not path.is_file():
            return {}
        values = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("\"'")
        return values

    @classmethod
    def load(cls) -> Settings:
        from_file = cls._from_file()
        values: dict[str, object] = {}
        missing: list[str] = []
        for f in fields(cls):
            key = f"{cls.PREFIX}{f.name.upper()}"
            raw = BOOT_ENV.get(key) or from_file.get(key)
            if raw:
                values[f.name] = CASTS[f.type](raw)
            elif f.name in cls.OPTIONAL:
                values[f.name] = ""
            else:
                missing.append(key)
        if missing:
            raise RuntimeError(
                f"설정값이 없습니다: {', '.join(missing)}\n"
                f"`cp .env.example .env` 또는 환경변수로 지정하세요 (찾은 위치: {cls.env_file()})"
            )
        return cls(**values)

    @property
    def milvus_is_server(self) -> bool:
        return self.milvus_uri.startswith(("http://", "https://", "tcp://", "unix:"))

    @property
    def milvus_path(self) -> Path:
        path = Path(self.milvus_uri)
        return path if path.is_absolute() else ROOT / path

    @property
    def milvus_target(self) -> str:
        return self.milvus_uri if self.milvus_is_server else str(self.milvus_path)

    @property
    def llm_options(self) -> dict[str, object]:
        return {
            "base_url": self.ollama_base_url,
            "model": self.model,
            "temperature": self.temperature,
            "num_ctx": self.num_ctx,
            "num_predict": self.num_predict,
            "keep_alive": self.keep_alive,
        }


# --- 엔진 --------------------------------------------------------------------

KINDS = {"policies": "정책 관리 검토", "events": "로그 감시", "nodes": "서버 점검", "events_fast": "빠른 로그 감시", "suspects": "위협 예측"}
# 화면에서 시작할 수 있는 작업. 서버 점검 · 위협 예측은 주기를 기다리지 않고 [지금 점검] · [지금 예측]으로도 돌립니다. 로그 감시는 서버가 스스로만 돌립니다.
MANUAL = {"policies", "nodes", "suspects"}


class Engine:
    """설정 · 모델 · RAG 저장소 · 두 DB · 작업 큐를 묶은 진입점.

    체인 메서드는 LangChain Runnable 을 돌려주므로 그대로 .invoke() · .stream() 할 수 있습니다.
    DB 는 처음 쓸 때 엽니다. 작업 큐(자동 로그 감시 · 서버 점검 · 권한 신청 판정)는 start() 로 켭니다 (웹).
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings.load()
        self.documents = DocumentStore(self.settings)
        self._llm: ChatOllama | None = None
        self._qa_llm: ChatOllama | None = None
        self.jobs: JobRunner | None = None
        self.fast: JobRunner | None = None
        self._fast_llm: ChatOllama | None = None
        self.verdicts: VerdictWorker | None = None

    # --- 모델 ---------------------------------------------------------------

    @property
    def llm(self) -> ChatOllama:
        if self._llm is None:
            self._llm = ChatOllama(**self.settings.llm_options)
        return self._llm

    @property
    def qa_llm(self) -> ChatOllama:
        """정책 · 로그 질의용 모델."""
        if self.settings.qa_model == self.settings.model:
            return self.llm
        if self._qa_llm is None:
            self._qa_llm = self.with_model(self.settings.qa_model)
        return self._qa_llm

    @property
    def fast_llm(self) -> ChatOllama:
        """빠른 로그 감시용 — 판정 모델과 같은 모델에 생각 단계만 끕니다. 묶음당 수 초지만 정확도가 떨어져 1차 판정에만 씁니다 (NOTES.md)."""
        if self._fast_llm is None:
            self._fast_llm = ChatOllama(**{**self.settings.llm_options, "reasoning": False})
        return self._fast_llm

    def with_model(self, model: str) -> ChatOllama:
        return ChatOllama(**{**self.settings.llm_options, "model": model})

    def models(self) -> list[str]:
        client = ollama.Client(host=self.settings.ollama_base_url)
        return sorted(m.model for m in client.list().models if m.model)

    def has_model(self, name: str, available: list[str] | None = None) -> bool:
        names = available if available is not None else self.models()
        return name in names or f"{name}:latest" in names

    def chain(self, prompt: ChatPromptTemplate, schema: type[BaseModel] | None = None,
              llm: ChatOllama | None = None) -> Runnable[dict[str, Any], Any]:
        model = llm or self.llm
        if schema is not None:
            return prompt | model.with_structured_output(schema)
        return prompt | model | StrOutputParser()

    # 체인 본체는 pipeline.py 에 있습니다. engine.review_chain() 처럼 부를 수 있게 넘겨 줍니다.

    def review_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.review_chain(self, *args, **kwargs)

    def policy_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.policy_chain(self, *args, **kwargs)

    def server_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.server_chain(self, *args, **kwargs)

    def event_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.event_chain(self, *args, **kwargs)

    def log_filter_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.log_filter_chain(self, *args, **kwargs)

    def log_answer_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.log_answer_chain(self, *args, **kwargs)

    def server_filter_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.server_filter_chain(self, *args, **kwargs)

    def server_answer_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.server_answer_chain(self, *args, **kwargs)

    def suspect_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.suspect_chain(self, *args, **kwargs)

    def answer_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.answer_chain(self, *args, **kwargs)

    def rag_chain(self, *args: Any, **kwargs: Any) -> Runnable[str, Any]:
        return pipeline.rag_chain(self, *args, **kwargs)

    # --- DB ----------------------------------------------------------------

    @cached_property
    def main_db(self) -> Database:
        """권한 DB — 계정 · 신청 · 결재 · 운영자 결정 · 노드 등록부."""
        return open_main_db(self.settings.db_path)

    @cached_property
    def results_db(self) -> Database:
        """AI 결과 DB — 정책 관리 검토 · 로그 감시 · 수집 · 서버 점검 · 질의 기록."""
        return open_results_db(self.settings.results_db_path)

    # --- 상태 ---------------------------------------------------------------

    def health(self) -> dict[str, Any]:
        """Ollama 연결 · 모델 · 인덱스 상태. 모두 준비되면 ok."""
        s = self.settings
        info: dict[str, Any] = {"base_url": s.ollama_base_url, "model": s.model, "qa_model": s.qa_model,
                                "embedding_model": s.embedding_model, "connected": False, "model_ready": False,
                                "qa_model_ready": False, "embedding_ready": False, "error": None}
        try:
            models = self.models()
            info.update(connected=True, model_ready=self.has_model(s.model, models),
                        qa_model_ready=self.has_model(s.qa_model, models), embedding_ready=self.has_model(s.embedding_model, models))
        except Exception as exc:
            info["error"] = f"{type(exc).__name__}: {exc}"
        info["index_ready"] = not self.documents.is_empty()
        info["ok"] = all(info[k] for k in ("connected", "model_ready", "qa_model_ready", "embedding_ready", "index_ready"))
        return info

    def status(self) -> dict[str, Any]:
        """웹 안에서 도는 것 — 작업 큐(진행 · 마지막 결과) · 자동 실행 예약 · 권한 신청 판정 대기열."""
        return {"jobs": {**self.job_status(), "kinds": KINDS},
                "schedule": {**(self.jobs.schedule() if self.jobs else {}), **(self.fast.schedule() if self.fast else {})},
                "verdicts": self.verdicts.snapshot() if self.verdicts else {}}

    def job_status(self) -> dict[str, Any]:
        """화면의 작업 상태. 빠른 로그 감시는 따로 돌아 다른 작업을 막지 않으므로 fast 에 따로 둡니다."""
        return {**(self.jobs.status() if self.jobs else {"running": None, "last": {}}),
                **({"fast": {**self.fast.status(), **self.fast.schedule().get("events_fast", {})}} if self.fast else {})}

    # --- 기능 (CLI 와 웹의 작업 큐가 같은 것을 부릅니다) ------------------------------------

    def index(self, source: Any = None, rebuild: bool = False) -> IndexReport:
        """기준 문서 적재 (바뀐 파일만, 기본 docs/). rebuild 면 컬렉션을 비우고 전부 새로 (규칙도 지워져 정책 관리 검토를 다시 돌려야 함)."""
        return pipeline.index_documents(self, source or pipeline.DOCS_DIR, rebuild)

    def run_policies(self, progress: Progress | None = None) -> dict[str, Any]:
        """정책 관리 검토 1회 — 기준 문서 · 정책 규칙 적재 + 정책 간 검토 → AI 결과 DB."""
        review = pipeline.review_policies(self, self.settings.policies_source, progress)
        results.save_policy_review(self.results_db, review, self.settings.model)
        return review

    def run_nodes(self, progress: Progress | None = None) -> dict[str, Any]:
        """서버 점검 1회 — 켜 둔 노드 중 지난 점검 뒤 새 수집이 온 것만. 판정은 한 건씩 바로 쌓아 중간에 멈춰도 끝난 것은 남습니다."""
        s = self.settings
        pending = results.pending_snapshots(self.results_db, nodes.enabled_names(self.main_db))

        def save(done: int, total: int, finding: dict[str, Any]) -> None:
            results.save_node_finding(self.results_db, finding, s.model)
            if progress:
                progress(done, total, finding)

        return pipeline.check_nodes(self, pending, s.policies_source, s.servers_source, save)

    def run_fast_events(self, progress: Progress | None = None) -> dict[str, Any]:
        """빠른 로그 감시 1회 — 지난 빠른 감시(또는 정밀 감시) 이후 로그만, 생각 단계를 끈 판정 모델로 1차 판정."""
        return self.run_events(progress=progress, stage="fast")

    def run_events(self, since: datetime | None = None, until: datetime | None = None, full: bool = False,
                   progress: Progress | None = None, stage: str = "final") -> dict[str, Any]:
        """로그 감시 1회 — since 를 주지 않으면 지난 감시 이후 로그만 (full 이면 처음부터). → 결과에 since 를 붙여 돌려줍니다."""
        if since is None and not full:
            since = results.next_monitor_since(self.results_db, stage)
        fast = stage == "fast"
        run = pipeline.monitor(self, self.settings.events_source, since, until, progress, fast=fast)
        results.save_monitor_run(self.results_db, run, f"{self.settings.model} (생각 끔)" if fast else self.settings.model,
                                 since.isoformat() if since else None, until.isoformat() if until else None, stage)
        return {**run, "since": since.isoformat() if since else None}

    @cached_property
    def _rag(self) -> Runnable[str, Any]:
        return self.rag_chain(structured=True)

    def ask(self, question: str, user: User) -> dict[str, Any]:
        """정책 질의 — 기준 조항 · 솔루션 규칙을 검색해 답하고 질의 기록에 남깁니다."""
        answer, error, elapsed = pipeline.attempt(lambda: self._rag.invoke(question))
        if answer is None:
            answer = Answer(answer=f"답변 실패: {error}", sources=[])
        result = {**answer.model_dump(), "elapsed_sec": round(elapsed, 1), "failed": error is not None, "error": error}
        results.save_qa(self.results_db, "policy", question, result, self.settings.qa_model, user)
        return result

    def ask_logs(self, question: str, user: User) -> dict[str, Any]:
        """로그 질의 — 조건(모델) → 찾고 세기(코드) → 답(모델). 질의 기록에 남깁니다."""
        result = pipeline.ask_logs(self, self.settings.events_source, question)
        results.save_qa(self.results_db, "logs", question, result, self.settings.qa_model, user)
        return result

    def ask_servers(self, question: str, user: User) -> dict[str, Any]:
        """서버 질의 — 조건(모델) → 수집 · 서버 점검 기록을 고르고 세기(코드) → 답(모델). 질의 기록에 남깁니다."""
        registry = nodes.list_nodes(self.main_db)
        result = pipeline.ask_servers(self, registry, lambda names, since, until: self._server_records(registry, names, since, until),
                                      question)
        results.save_qa(self.results_db, "servers", question, result, self.settings.qa_model, user)
        return result

    def _server_records(self, registry: list[dict[str, Any]], names: list[str], since: str | None,
                        until: str | None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """서버 질의의 근거 — 노드별 지금 상태(가장 늦은 수집 · 마지막 판정)와 기간 안 수집 · 판정 기록."""
        findings = {f["node"]: f for f in results.latest_node_findings(self.results_db)}
        current = []
        for n in (n for n in registry if n["name"] in names):
            snap = results.latest_snapshot(self.results_db, n["name"])
            status = ("꺼짐" if not n["enabled"] else "끊김" if nodes.is_stale(n)
                      else "수집 중" if n["last_seen_at"] else "키 없음" if not n["key_issued"] else "기다리는 중")
            current.append({"node": n["name"], "host": (snap or n)["host"], "ip": (snap or n)["ip"], "status": status,
                            "collected_at": snap["collected_at"] if snap else "", "modules": snap["modules"] if snap else {},
                            "finding": findings.get(n["name"])})
        return current, results.server_history(self.results_db, names, since, until)

    def stats(self, period: str) -> dict[str, Any]:
        """보안 통계 — 지금부터 period(week · month · quarter · all 등) 안의 위협 로그 비율 · 빈도와 노드 위협 데이터를 셉니다. 모델은 쓰지 않습니다.

        사용자별 위협 로그 · 권한 신청은 user_stats(사용자 위협)로 나눴습니다.
        """
        since = period_since(period, datetime.now(timezone.utc))
        at = since.isoformat(timespec="seconds") if since else None
        # 위협 로그 비율의 분모 — 기간 안 로그 전체. 로그를 읽지 못하면 비율 없이 건수만 보여줍니다.
        try:
            logs = load_events(self.settings.events_source, since=since).records
            total = {"count": len(logs), "days": dict(Counter(e.occurred_at.astimezone().date().isoformat() for e in logs))}
        except (FileNotFoundError, ValueError) as exc:
            total = {"count": None, "days": {}, "error": str(exc)}
        found = results.threat_stats(self.results_db, at)
        registry = [n for n in nodes.list_nodes(self.main_db) if n["enabled"]]
        safety = results.server_safety(self.results_db, [n["name"] for n in registry], {n["name"] for n in registry if nodes.is_stale(n)}, at)
        return {"period": period, "since": at, "logs": total, "safety": safety,
                "events": {k: v for k, v in found["events"].items() if k != "users"}, "servers": found["servers"]}

    def user_stats(self, period: str) -> dict[str, Any]:
        """사용자 위협 — 의심 점수(사람마다 지금 가진 권한 포함) · 사용자별 위협 로그 판정 · 권한 신청 타일."""
        since = period_since(period, datetime.now(timezone.utc))
        at = since.isoformat(timespec="seconds") if since else None
        suspects = results.latest_suspects(self.results_db)
        held = permissions.held_by_account(self.main_db)
        for p in suspects:
            # 의심 점수의 사람 키는 계정이면 account:{id} 입니다 (data.suspect.suspect_people). 계정 미연결은 권한을 알 수 없어 None.
            p["held"] = held.get(int(p["key"].split(":", 1)[1]), []) if p["key"].startswith("account:") else None
        return {"period": period, "since": at, "events": {"users": results.threat_stats(self.results_db, at)["events"]["users"]},
                "requests": permissions.request_stats(self.main_db, at), "suspects": suspects, "safety": results.user_safety(self.results_db, at)}

    def run_suspects(self, progress: Progress | None = None) -> dict[str, Any]:
        """위협 예측 1회 — 사람마다 행동 신호(코드) · 판정 · 신청 기록으로 판정 모델이 의심 점수를 냅니다. 한 사람씩 바로 쌓습니다.

        신호는 로그 전체에서 최근 7일을 그 앞 4주와 견주고, 판정 · 신청 기록은 지금부터 35일 안의 것을 봅니다.
        """
        now = datetime.now(timezone.utc)
        recent = (now - timedelta(days=35)).isoformat(timespec="seconds")
        events = load_events(self.settings.events_source).records
        lines: dict[str, list[str]] = {}
        for e in events:
            lines.setdefault(e.user_id or e.who, []).append(e.describe())
        people = suspect_people(auth.accounts_brief(self.main_db), behavior_signals(events, now),
                                results.user_findings(self.results_db, recent), permissions.user_requests(self.main_db, recent))
        scored = []
        for n, person in enumerate(people, start=1):
            result = pipeline.predict_suspect(self, person, lines.get(person["log_id"], []) if person["log_id"] else [])
            results.save_suspect(self.results_db, person, result, self.settings.model)
            scored.append({"key": person["key"], **result})
            if progress:
                progress(n, len(people), result)
        return {"people": scored}

    def browse_logs(self, user: User, period: str, who: str = "", solution: str = "", how: str = "", page: int = 1,
                    ip: str | None = None) -> dict[str, Any]:
        """로그 조회 — 모델 없이 거르고 셉니다. 누가 어떤 조건으로 봤는지 감사 기록에 남깁니다."""
        result = pipeline.browse_logs(self.settings.events_source, period, who, solution, how, page)
        auth.record_log_view(self.main_db, user, {"period": period, **result["criteria"], "page": page}, ip)
        return result

    def receive_snapshot(self, presented: str, payload: dict[str, Any]) -> dict[str, Any]:
        """수집 노드가 보낸 수집 한 건 — 노드는 키만 보내고, 키로 어느 노드인지 찾습니다.

        형식이 틀리면 ValueError, 모르는 키는 nodes.Unauthorized, 꺼진 노드는 Denied. 형식을 먼저 봅니다 (등록부를 건드리기 전에).
        """
        pipeline.snapshot_row(payload, "_", None)
        name = nodes.authenticate(self.main_db, presented, payload)["name"]
        row = pipeline.snapshot_row(payload, name, results.latest_snapshot(self.results_db, name))
        _, stored = results.save_snapshot(self.results_db, row)
        if stored:
            nodes.mark_collected(self.main_db, name, row["collected_at"])
        return {"node": name, "stored": stored}

    def import_snapshots(self, folder: Any, node: str | None = None) -> tuple[LoadResult, int]:
        """망이 막힌 노드가 export 한 수집 파일을 같은 규칙으로 넣습니다. node = 이 파일들의 노드 이름.
        등록부에 없는 노드는 키 없이 등록해 둡니다. → (읽은 결과, 새로 넣은 수)"""
        loaded = load_collected(folder, node)
        stored = 0
        for snap in sorted(loaded.records, key=lambda x: x.collected_at):
            payload = {**snap.model_dump(mode="json", exclude={"raw", "modules"}), "format": FORMAT}
            row = pipeline.snapshot_row(payload, snap.node, results.latest_snapshot(self.results_db, snap.node))
            nodes.ensure(self.main_db, snap.node, row)
            _, inserted = results.save_snapshot(self.results_db, row)
            if inserted:
                nodes.mark_collected(self.main_db, snap.node, row["collected_at"])
            stored += inserted
        return loaded, stored

    def judge_request(self, request_no: str) -> dict[str, Any] | None:
        """권한 신청 한 건의 AI 판정 (저장은 save_request_verdict). 신청이 없으면 None."""
        with self.main_db.connection() as conn:
            row = conn.execute(
                "SELECT r.*, c.system AS access_system, c.category AS access_category, c.description AS access_description"
                " FROM access_requests r LEFT JOIN access_catalog c ON c.code = r.access_code WHERE r.request_no = ?",
                (request_no,)).fetchone()
        return pipeline.judge_request(self, dict(row)) if row else None

    def save_request_verdict(self, request_no: str, result: dict[str, Any]) -> bool:
        """판정을 신청 행의 AI 칸에 씁니다. 그사이 1차 결재가 났으면 버리고 False."""
        return permissions.save_ai_verdict(self.main_db, request_no, result, self.settings.model)

    # --- 작업 큐 (웹) ---------------------------------------------------------

    def start(self) -> None:
        """권한 신청 판정 큐(밀린 것 이어서) · 자동 로그 감시 · 서버 점검을 켭니다. 둘 다 뜨자마자 한 번, 그 뒤 정한 간격마다."""
        self.verdicts = VerdictWorker(self)
        self.verdicts.resume()
        self.jobs = JobRunner(self)
        for kind in ("events", "nodes", "suspects"):
            self.jobs.every(kind, self.settings.monitor_interval_min)
        # 빠른 로그 감시는 따로 돌립니다. 정책 관리 검토 · 서버 점검 · 정밀 감시가 돌고 있어도 기다리지 않습니다.
        if self.settings.fast_interval_min:
            self.fast = JobRunner(self)
            self.fast.every("events_fast", int(self.settings.fast_interval_min))

    def stop(self) -> None:
        """큐를 멈추고 벡터 DB 잠금을 풉니다. --reload 로 새로 뜨는 프로세스 · CLI 가 벡터 DB 를 열 수 있게 합니다."""
        if self.jobs:
            self.jobs.stop()
        if self.fast:
            self.fast.stop()
        if self.verdicts:
            self.verdicts.stop()
        self.documents.close()


class JobRunner:
    """정책 관리 검토 · 로그 감시 · 서버 점검을 백그라운드 스레드로 한 번에 하나씩 돌립니다.

    판정 한 번에 수 분이 걸리므로 요청 안에서 기다리지 않고, 화면은 status() 로 진행 상황을 봅니다.
    모델은 한 번에 한 판정만 하므로 작업도 한 번에 하나만 돌립니다. 자동 실행 차례에 다른 작업이 돌고 있으면 RETRY 뒤에 다시 시도합니다.
    Milvus Lite 는 한 프로세스만 열 수 있어 웹이 떠 있는 동안에는 CLI 가 돌 수 없으므로 여기서 돌립니다.
    """

    RETRY = timedelta(minutes=1)

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._status: dict[str, Any] = {"running": None, "auto": False, "done": 0, "total": 0, "started_at": None, "last": {}}
        self._schedule: dict[str, dict[str, Any]] = {}

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {**self._status, "last": dict(self._status["last"])}

    def schedule(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {k: dict(v) for k, v in self._schedule.items()}

    def start(self, kind: str, auto: bool = False) -> bool:
        """작업을 시작합니다. 다른 작업이 돌고 있으면 False"""
        with self._lock:
            if self._status["running"]:
                return False
            self._status.update(running=kind, auto=auto, done=0, total=0, started_at=_now())
        threading.Thread(target=self._run, args=(kind, auto), daemon=True).start()
        return True

    def every(self, kind: str, minutes: int) -> None:
        """kind 작업을 지금 한 번, 그 뒤 minutes 분마다 시작합니다 (0 이하면 끔).

        웹이 꺼져 있던 동안 쌓인 것을 바로 따라잡게 합니다. 로그 감시 · 서버 점검은 지난번 이후만 판정하므로 다시 떠도 같은 것을 또 판정하지 않습니다.
        """
        if minutes > 0:
            threading.Thread(target=self._every, args=(kind, timedelta(minutes=minutes)), daemon=True).start()

    def stop(self) -> None:
        self._stop.set()

    def _every(self, kind: str, interval: timedelta) -> None:
        wait = timedelta(0)
        while True:
            with self._lock:
                self._schedule[kind] = {"every_min": int(interval.total_seconds() // 60),
                                        "next_at": (datetime.now() + wait).isoformat(timespec="seconds")}
            if self._stop.wait(wait.total_seconds()):
                return
            wait = interval if self.start(kind, auto=True) else self.RETRY

    def _progress(self, done: int, total: int, _item: dict[str, Any]) -> None:
        with self._lock:
            self._status.update(done=done, total=total)

    def _run(self, kind: str, auto: bool) -> None:
        error = None
        try:
            {"policies": self.engine.run_policies, "events": self.engine.run_events, "events_fast": self.engine.run_fast_events,
             "suspects": self.engine.run_suspects,
             "nodes": self.engine.run_nodes}[kind](progress=self._progress)
        except Exception as exc:  # 파일 없음 · 컬럼 없음 등은 화면에 그대로 보여줍니다.
            error = f"{type(exc).__name__}: {exc}"
        with self._lock:
            self._status["last"][kind] = {"finished_at": _now(), "error": error, "auto": auto}
            self._status.update(running=None, auto=False)


class VerdictWorker:
    """권한 신청이 들어오면 바로 AI 판정을 돌립니다 (백그라운드, 한 번에 한 건).

    판정 한 건에 수십 초가 걸리므로 신청 응답을 기다리게 하지 않습니다. 결과는 신청 행의 AI 칸에 쓰고 결재 화면이 읽어 갑니다.
    1차 결재가 먼저 나면 판정은 버립니다 (결재자가 본 판정이 바뀌지 않도록).
    """

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self._queue: queue.Queue[str] = queue.Queue()
        self._pending: set[str] = set()
        self._current: str | None = None
        self._lock = threading.Lock()
        self._stopping = threading.Event()
        threading.Thread(target=self._run, daemon=True).start()

    def stop(self) -> None:
        """새 판정은 시작하지 않고, 돌던 판정은 결과를 남기지 않습니다 (다음 시작 때 다시 돕니다)."""
        self._stopping.set()
        self._queue.put("")

    def enqueue(self, request_no: str) -> None:
        with self._lock:
            if request_no in self._pending:
                return
            self._pending.add(request_no)
        self._queue.put(request_no)

    def pending(self, request_no: str) -> bool:
        with self._lock:
            return request_no in self._pending

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {"current": self._current, "waiting": sorted(self._pending - {self._current})}

    def resume(self) -> None:
        """1차 결재 전인데 판정이 없거나 실패한 신청을 다시 줄 세웁니다 (웹을 다시 띄웠을 때)."""
        for request_no in permissions.unjudged(self.engine.main_db):
            self.enqueue(request_no)

    def _run(self) -> None:
        while not self._stopping.is_set():
            request_no = self._queue.get()
            if self._stopping.is_set():
                return
            with self._lock:
                self._current = request_no
            try:
                result = self.engine.judge_request(request_no)
                # 종료 중에 끝난 판정은 벡터 DB 가 먼저 닫혀 실패했을 수 있어 남기지 않습니다.
                if result is not None and not self._stopping.is_set() and not self.engine.save_request_verdict(request_no, result):
                    log.info("권한 신청 %s 은 판정 중에 1차 결재가 나서 판정을 버립니다", request_no)
            except Exception:  # 한 건이 실패해도 다음 신청은 판정해야 합니다. LLM 실패는 judge_request 가 판정 실패로 남깁니다.
                log.exception("권한 신청 %s 판정을 저장하지 못했습니다", request_no)
            finally:
                with self._lock:
                    self._pending.discard(request_no)
                    self._current = None


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


__all__ = ["Engine", "JobRunner", "KINDS", "MANUAL", "Settings", "VerdictWorker"]
