"""SentinelAI 엔진 — 설정 · 모델 · RAG 저장소 · 두 DB · 작업 큐를 한곳에서 엽니다."""
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
from ..data import LoadResult, SecurityEvent, behavior_signals, load_collected, load_events, period_since, summarize, suspect_people
from ..data.suspect import THREAT_LIMIT, threat_lines
from ..data.collected import FORMAT
from ..db import Database, User, auth, decisions, nodes, open_main_db, open_results_db, permissions, results
from . import pipeline
from .rag import DocumentStore, IndexReport
from .types import Answer

log = logging.getLogger(__name__)

CASTS = {"str": str, "int": int, "float": float}
# pymilvus 가 .env 를 주입하기 전의 환경변수입니다.
BOOT_ENV = dict(os.environ)

Progress = Callable[[int, int, dict[str, Any]], None]


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

    # fast_interval_min 을 비우면 빠른 감시 없이 정밀 감시만 돕니다.
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


KINDS = {"policies": "정책 관리 검토", "events": "로그 감시", "nodes": "서버 점검", "events_fast": "빠른 로그 감시", "suspects": "위협 예측"}
# 화면에서 시작할 수 있는 작업입니다. 로그 감시는 서버가 스스로만 돌립니다.
MANUAL = {"policies", "nodes", "suspects"}


class Engine:
    """웹 · CLI 의 단일 진입점입니다. DB 는 처음 쓸 때 열고, 작업 큐는 start() 로 켭니다."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings.load()
        self.documents = DocumentStore(self.settings)
        self._llm: ChatOllama | None = None
        self._qa_llm: ChatOllama | None = None
        self.jobs: JobRunner | None = None
        self.fast: JobRunner | None = None
        self._fast_llm: ChatOllama | None = None
        self.verdicts: VerdictWorker | None = None

    @property
    def llm(self) -> ChatOllama:
        if self._llm is None:
            self._llm = ChatOllama(**self.settings.llm_options)
        return self._llm

    @property
    def qa_llm(self) -> ChatOllama:
        if self.settings.qa_model == self.settings.model:
            return self.llm
        if self._qa_llm is None:
            self._qa_llm = self.with_model(self.settings.qa_model)
        return self._qa_llm

    @property
    def fast_llm(self) -> ChatOllama:
        """생각 단계를 끈 판정 모델입니다. 빠르지만 덜 정확해 1차 판정에만 씁니다."""
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

    def review_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.review_chain(self, *args, **kwargs)

    def grant_chain(self, *args: Any, **kwargs: Any) -> Runnable[dict[str, Any], Any]:
        return pipeline.grant_chain(self, *args, **kwargs)

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

    @cached_property
    def main_db(self) -> Database:
        """권한 DB — 계정 · 신청 · 결재 · 운영자 결정 · 노드 등록부."""
        return open_main_db(self.settings.db_path)

    @cached_property
    def results_db(self) -> Database:
        """AI 결과 DB — 판정 · 수집 · 질의 기록."""
        return open_results_db(self.settings.results_db_path)

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
        """작업 큐 · 자동 실행 예약 · 권한 신청 판정 대기열."""
        return {"jobs": {**self.job_status(), "kinds": KINDS},
                "schedule": {**(self.jobs.schedule() if self.jobs else {}), **(self.fast.schedule() if self.fast else {})},
                "verdicts": self.verdicts.snapshot() if self.verdicts else {}}

    def job_status(self) -> dict[str, Any]:
        """빠른 로그 감시는 다른 작업을 막지 않으므로 fast 에 따로 둡니다."""
        return {**(self.jobs.status() if self.jobs else {"running": None, "last": {}}),
                **({"fast": {**self.fast.status(), **self.fast.schedule().get("events_fast", {})}} if self.fast else {})}

    def index(self, source: Any = None, rebuild: bool = False) -> IndexReport:
        """바뀐 파일만 적재합니다. rebuild 면 규칙까지 지우므로 정책 관리 검토를 다시 돌려야 합니다."""
        return pipeline.index_documents(self, source or pipeline.DOCS_DIR, rebuild)

    def remove_document(self, name: str) -> bool:
        """RAG 에서만 뺍니다. docs/ 의 파일은 부르는 쪽이 지웁니다."""
        return self.documents.remove(name)

    def run_policies(self, progress: Progress | None = None) -> dict[str, Any]:
        """정책 관리 검토 1회 — 기준 문서 · 규칙 적재 후 정책 간 검토."""
        review = pipeline.review_policies(self, self.settings.policies_source, progress)
        results.save_policy_review(self.results_db, review, self.settings.model)
        return review

    def run_nodes(self, progress: Progress | None = None) -> dict[str, Any]:
        """새 수집이 온 노드만 판정하고, 한 건씩 바로 쌓아 중간에 멈춰도 남습니다."""
        s = self.settings
        pending = results.pending_snapshots(self.results_db, nodes.enabled_names(self.main_db))

        def save(done: int, total: int, finding: dict[str, Any]) -> None:
            results.save_node_finding(self.results_db, finding, s.model)
            if progress:
                progress(done, total, finding)

        return pipeline.check_nodes(self, pending, s.policies_source, s.servers_source, save)

    def run_fast_events(self, progress: Progress | None = None) -> dict[str, Any]:
        """지난 감시 이후 로그만 생각 단계를 끈 모델로 1차 판정합니다."""
        return self.run_events(progress=progress, stage="fast")

    def run_events(self, since: datetime | None = None, until: datetime | None = None, full: bool = False,
                   progress: Progress | None = None, stage: str = "final") -> dict[str, Any]:
        """since 가 없으면 지난 감시 이후만, full 이면 처음부터 판정합니다."""
        if since is None and not full:
            since = results.next_monitor_since(self.results_db, stage)
        fast = stage == "fast"
        records = None if fast else self.user_records()
        run = pipeline.monitor(self, self.settings.events_source, since, until, progress, fast=fast,
                               history=None if fast else (lambda log_id: records(log_id=log_id)))
        results.save_monitor_run(self.results_db, run, f"{self.settings.model} (생각 끔)" if fast else self.settings.model,
                                 since.isoformat() if since else None, until.isoformat() if until else None, stage)
        return {**run, "since": since.isoformat() if since else None}

    @cached_property
    def _rag(self) -> Runnable[str, Any]:
        return self.rag_chain(structured=True)

    def ask(self, question: str, user: User) -> dict[str, Any]:
        answer, error, elapsed = pipeline.attempt(lambda: self._rag.invoke(question))
        if answer is None:
            answer = Answer(answer=f"답변 실패: {error}", sources=[])
        result = {**answer.model_dump(), "elapsed_sec": round(elapsed, 1), "failed": error is not None, "error": error}
        results.save_qa(self.results_db, "policy", question, result, self.settings.qa_model, user)
        return result

    def ask_logs(self, question: str, user: User) -> dict[str, Any]:
        """조건(모델) → 찾고 세기(코드) → 답(모델)."""
        result = pipeline.ask_logs(self, self.settings.events_source, question)
        results.save_qa(self.results_db, "logs", question, result, self.settings.qa_model, user)
        return result

    def ask_servers(self, question: str, user: User) -> dict[str, Any]:
        """조건(모델) → 기록 고르고 세기(코드) → 답(모델)."""
        registry = nodes.list_nodes(self.main_db)
        result = pipeline.ask_servers(self, registry, lambda names, since, until: self._server_records(registry, names, since, until),
                                      question)
        results.save_qa(self.results_db, "servers", question, result, self.settings.qa_model, user)
        return result

    def _server_records(self, registry: list[dict[str, Any]], names: list[str], since: str | None,
                        until: str | None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """노드별 지금 상태(가장 늦은 수집 · 마지막 판정)와 기간 안 기록."""
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
        """위협 로그 비율 · 빈도와 노드 위협을 셉니다 (모델 없음)."""
        since = period_since(period, datetime.now(timezone.utc))
        at = since.isoformat(timespec="seconds") if since else None
        # 로그를 읽지 못하면 비율 없이 건수만 보여줍니다.
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
        since = period_since(period, datetime.now(timezone.utc))
        at = since.isoformat(timespec="seconds") if since else None
        suspects = results.latest_suspects(self.results_db)
        held = permissions.held_by_account(self.main_db)
        for p in suspects:
            # 사람 키가 account:{id} 가 아니면 계정 미연결이라 권한을 알 수 없습니다.
            p["held"] = held.get(int(p["key"].split(":", 1)[1]), []) if p["key"].startswith("account:") else None
        return {"period": period, "since": at, "events": {"users": results.threat_stats(self.results_db, at)["events"]["users"]},
                "requests": permissions.request_stats(self.main_db, at), "suspects": suspects, "safety": results.user_safety(self.results_db, at)}

    def run_suspects(self, progress: Progress | None = None) -> dict[str, Any]:
        """사람마다 의심 점수를 내고 한 사람씩 바로 쌓습니다. 모델에는 예전 AI 등급을 넣지 않습니다."""
        now = datetime.now(timezone.utc)
        recent = (now - timedelta(days=35)).isoformat(timespec="seconds")
        events = load_events(self.settings.events_source).records
        people = suspect_people(auth.accounts_brief(self.main_db), behavior_signals(events, now),
                                results.user_findings(self.results_db, recent), permissions.user_requests(self.main_db, recent))
        records = self.user_records(events)
        scored = []
        for n, person in enumerate(people, start=1):
            account = int(person["key"].split(":")[1]) if person["key"].startswith("account:") else None
            record, threats = records(account, person["log_id"] or "", signals=False)
            result = pipeline.predict_suspect(self, person, record, threats)
            results.save_suspect(self.results_db, person, result, self.settings.model)
            scored.append({"key": person["key"], **result})
            if progress:
                progress(n, len(people), result)
        return {"people": scored}

    def browse_logs(self, user: User, period: str, who: str = "", solution: str = "", how: str = "", page: int = 1,
                    ip: str | None = None) -> dict[str, Any]:
        """모델 없이 거르고 세며, 조회 조건을 감사 기록에 남깁니다."""
        result = pipeline.browse_logs(self.settings.events_source, period, who, solution, how, page)
        auth.record_log_view(self.main_db, user, {"period": period, **result["criteria"], "page": page}, ip)
        return result

    def receive_snapshot(self, presented: str, payload: dict[str, Any]) -> dict[str, Any]:
        """키로 노드를 찾습니다. 형식 오류 ValueError · 모르는 키 Unauthorized · 꺼진 노드 Denied."""
        pipeline.snapshot_row(payload, "_", None)
        name = nodes.authenticate(self.main_db, presented, payload)["name"]
        row = pipeline.snapshot_row(payload, name, results.latest_snapshot(self.results_db, name))
        _, stored = results.save_snapshot(self.results_db, row)
        if stored:
            nodes.mark_collected(self.main_db, name, row["collected_at"])
        return {"node": name, "stored": stored}

    def import_snapshots(self, folder: Any, node: str | None = None) -> tuple[LoadResult, int]:
        """등록부에 없는 노드는 키 없이 등록합니다. → (읽은 결과, 새로 넣은 수)"""
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
        """신청이 없으면 None. 저장은 save_request_verdict 가 합니다."""
        row = permissions.judge_input(self.main_db, request_no)
        if row is None:
            return None
        record, threats = self.user_records()(row["requester_id"], before=row["submitted_at"])
        return pipeline.judge_request(self, row, record, threats)

    def save_request_verdict(self, request_no: str, result: dict[str, Any]) -> bool:
        """그사이 1차 결재가 났으면 버리고 False."""
        return permissions.save_ai_verdict(self.main_db, request_no, result, self.settings.model)

    def judge_grant(self, request_no: str, move_id: int) -> dict[str, Any] | None:
        """이동 뒤 보유 권한 재검토입니다. 회수 · 만료됐거나 더 늦은 이동이 있으면 None."""
        grant = permissions.grant_input(self.main_db, request_no, move_id)
        if grant is None:
            return None
        record, threats = self.user_records()(grant["requester_id"])
        return pipeline.judge_grant(self, grant, record, threats)

    def user_records(self, events: list[SecurityEvent] | None = None) -> Callable[..., tuple[str, str]]:
        """records(계정 id, 로그 사용자 ID, before, signals) → (사용자 기록, 위협 기록). 로그 · 결정은 한 번만 읽습니다."""
        events = load_events(self.settings.events_source).records if events is None else events
        by_user: dict[str, list[SecurityEvent]] = {}
        for e in events:
            by_user.setdefault(e.user_id or e.who, []).append(e)
        accounts = auth.accounts_brief(self.main_db)
        acts = {k: d for k, d in decisions.current(self.main_db, "event").items() if d["action"] == "act"}
        owners = results.finding_users(self.results_db, [int(k.split("/")[1]) for k in acts if k.startswith("event_findings/")])
        all_signals = behavior_signals(events)

        def records(account_id: int | None = None, log_id: str = "", before: str | None = None, signals: bool = True) -> tuple[str, str]:
            if account_id is None and log_id:
                account_id = next((a["id"] for a in accounts if a["log_id"] == log_id), None)
            account = permissions.account_record(self.main_db, account_id, before) if account_id is not None else None
            log_id = log_id or (account or {}).get("log_id") or ""
            mine = sorted(by_user.get(log_id, []), key=lambda e: e.occurred_at) if log_id else []
            human = [f"- {o['at'][:16].replace('T', ' ')} UTC 로그 감시 묶음 — {d['decider_name']}이(가) 조치 필요로 정함"
                     + (f": {d['comment'][:100]}" if d["comment"] else "")
                     for k, d in acts.items() if (o := owners.get(int(k.split("/")[1]))) and log_id and o["log_id"] == log_id]
            human = sorted(human)[-THREAT_LIMIT:]
            lines = human + threat_lines(mine, THREAT_LIMIT - len(human))
            text = pipeline.user_record_text(account, log_id, summarize(mine) if mine else None,
                                             all_signals.get(log_id) if log_id else None, signals)
            return text, "\n".join(lines) or pipeline.NO_RECORD

        return records

    def save_grant_review(self, request_no: str, move_id: int, result: dict[str, Any]) -> bool:
        return permissions.save_grant_review(self.main_db, request_no, move_id, result, self.settings.model)

    def start(self) -> None:
        """권한 신청 판정 큐 · 자동 감시를 켭니다. 뜨자마자 한 번, 그 뒤 정한 간격마다 돕니다."""
        self.verdicts = VerdictWorker(self)
        self.verdicts.resume()
        self.jobs = JobRunner(self)
        for kind in ("events", "nodes", "suspects"):
            self.jobs.every(kind, self.settings.monitor_interval_min)
        # 빠른 감시는 다른 작업이 돌고 있어도 기다리지 않게 따로 돌립니다.
        if self.settings.fast_interval_min:
            self.fast = JobRunner(self)
            self.fast.every("events_fast", int(self.settings.fast_interval_min))

    def reset_jobs(self, rerun: bool = False) -> list[str]:
        """돌고 있는 작업을 강제로 끝냅니다. rerun 이면 곧바로 다시 시작합니다. → 끝낸 작업 종류"""
        reset = []
        for runner in (self.jobs, self.fast):
            kind = runner.reset() if runner else None
            if kind:
                reset.append(kind)
                if rerun:
                    runner.start(kind)
        return reset

    def stop(self) -> None:
        """큐를 멈추고 벡터 DB 잠금을 풀어 다른 프로세스가 열 수 있게 합니다."""
        if self.jobs:
            self.jobs.stop()
        if self.fast:
            self.fast.stop()
        if self.verdicts:
            self.verdicts.stop()
        self.documents.close()


class JobCancelled(Exception):
    """reset() 으로 끝낸 작업 — 결과를 남기지 않습니다."""


class JobRunner:
    """작업을 백그라운드 스레드로 한 번에 하나씩 돌립니다. 모델이 한 번에 한 판정만 하기 때문입니다."""

    RETRY = timedelta(minutes=1)

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._status: dict[str, Any] = {"running": None, "auto": False, "done": 0, "total": 0, "started_at": None, "last": {}}
        self._schedule: dict[str, dict[str, Any]] = {}
        # reset() 뒤에도 돌던 스레드가 상태 · 결과를 덮어쓰지 못하게 작업마다 번호를 매깁니다.
        self._generation = 0

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {**self._status, "last": dict(self._status["last"])}

    def schedule(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {k: dict(v) for k, v in self._schedule.items()}

    def start(self, kind: str, auto: bool = False) -> bool:
        """다른 작업이 돌고 있으면 False"""
        with self._lock:
            if self._status["running"]:
                return False
            self._generation += 1
            self._status.update(running=kind, auto=auto, done=0, total=0, started_at=_now())
            generation = self._generation
        threading.Thread(target=self._run, args=(kind, auto, generation), daemon=True).start()
        return True

    def reset(self) -> str | None:
        """스레드는 밖에서 멈출 수 없어 다음 진행 보고 때 멈춥니다. → 끝낸 작업 종류 (없으면 None)"""
        with self._lock:
            kind = self._status["running"]
            if not kind:
                return None
            self._generation += 1
            self._status["last"][kind] = {"finished_at": _now(), "error": "강제로 끝냈습니다", "auto": self._status["auto"]}
            self._status.update(running=None, auto=False, done=0, total=0)
            return kind

    def every(self, kind: str, minutes: int) -> None:
        """지금 한 번, 그 뒤 minutes 분마다 시작합니다 (0 이하면 끔)."""
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

    def _progress(self, generation: int, done: int, total: int) -> None:
        with self._lock:
            if generation != self._generation:
                raise JobCancelled
            self._status.update(done=done, total=total)

    def _run(self, kind: str, auto: bool, generation: int) -> None:
        error = None
        progress = lambda done, total, _item: self._progress(generation, done, total)  # noqa: E731
        try:
            {"policies": self.engine.run_policies, "events": self.engine.run_events, "events_fast": self.engine.run_fast_events,
             "suspects": self.engine.run_suspects,
             "nodes": self.engine.run_nodes}[kind](progress=progress)
        except JobCancelled:
            return
        except Exception as exc:  # 파일 없음 · 컬럼 없음 등은 화면에 그대로 보여줍니다.
            error = f"{type(exc).__name__}: {exc}"
        with self._lock:
            if generation != self._generation:
                return
            self._status["last"][kind] = {"finished_at": _now(), "error": error, "auto": auto}
            self._status.update(running=None, auto=False)


class VerdictWorker:
    """권한 신청을 백그라운드에서 한 건씩 판정합니다. 1차 결재가 먼저 나면 판정은 버립니다."""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self._queue: queue.Queue[str] = queue.Queue()
        self._pending: set[str] = set()
        self._current: str | None = None
        self._lock = threading.Lock()
        self._stopping = threading.Event()
        threading.Thread(target=self._run, daemon=True).start()

    def stop(self) -> None:
        """돌던 판정은 결과를 남기지 않습니다 (다음 시작 때 다시 돕니다)."""
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
        """판정이 없거나 실패한 신청과 재검토가 없는 보유 권한을 다시 줄 세웁니다."""
        for task in permissions.unjudged(self.engine.main_db) + permissions.pending_grant_reviews(self.engine.main_db):
            self.enqueue(task)

    def enqueue_grants(self, user_id: int) -> None:
        for task in permissions.pending_grant_reviews(self.engine.main_db, user_id):
            self.enqueue(task)

    def _run(self) -> None:
        while not self._stopping.is_set():
            request_no = self._queue.get()
            if self._stopping.is_set():
                return
            with self._lock:
                self._current = request_no
            try:
                if request_no.startswith("grant:"):
                    self._grant(request_no)
                    continue
                result = self.engine.judge_request(request_no)
                # 종료 중에 끝난 판정은 벡터 DB 가 먼저 닫혀 실패했을 수 있습니다.
                if result is not None and not self._stopping.is_set() and not self.engine.save_request_verdict(request_no, result):
                    log.info("권한 신청 %s 은 판정 중에 1차 결재가 나서 판정을 버립니다", request_no)
            except Exception:  # 한 건이 실패해도 다음 신청은 판정해야 합니다.
                log.exception("권한 신청 %s 판정을 저장하지 못했습니다", request_no)
            finally:
                with self._lock:
                    self._pending.discard(request_no)
                    self._current = None


    def _grant(self, task: str) -> None:
        """grant:신청번호:이동 id. 그사이 회수 · 만료되면 남기지 않습니다."""
        _, request_no, move_id = task.split(":")
        result = self.engine.judge_grant(request_no, int(move_id))
        if result is not None and not self._stopping.is_set() and not self.engine.save_grant_review(request_no, int(move_id), result):
            log.info("보유 권한 %s 은 재검토 중에 회수 · 만료되어 판정을 버립니다", request_no)


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


__all__ = ["Engine", "JobRunner", "KINDS", "MANUAL", "Settings", "VerdictWorker"]
