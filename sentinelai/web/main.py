"""FastAPI 백엔드 — `make web` 후 http://localhost:8000"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

# Milvus Lite 의 gRPC keepalive 경고를 숨깁니다 (동작 영향 없음). import 전에 설정해야 합니다.
os.environ.setdefault("GRPC_VERBOSITY", "NONE")

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, StringConstraints  # noqa: E402

from sentinelai import ROOT, pipeline  # noqa: E402
from sentinelai.engine import Answer, Engine  # noqa: E402

from . import view  # noqa: E402
from .jobs import KINDS, JobRunner  # noqa: E402

DOCS_DIR = ROOT / "docs"
STATIC_DIR = Path(__file__).resolve().parent / "static"

state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Engine 은 앱 시작 시 1회만 만듭니다. 요청마다 만들면 모델 로딩이 반복됩니다.
    # Milvus Lite 는 한 프로세스만 DB 를 열 수 있으므로, 웹이 떠 있는 동안 판정은 모두 웹의 작업으로 돌립니다.
    engine = Engine()
    state["engine"] = engine
    state["store"] = pipeline.ResultStore(engine.settings.results_path)
    state["jobs"] = JobRunner(engine, state["store"])
    state["rag_chain"] = engine.rag_chain(structured=True)
    yield
    state.clear()


app = FastAPI(
    title="SentinelAI",
    description="AI 보안 정책 검토 시스템 — 전북대학교 RAD(RAG & Decision) · SK쉴더스",
    lifespan=lifespan,
)

# 데모 전용 설정입니다. 사내 환경에 올릴 때는 허용 출처를 한정해야 합니다.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Ollama 연결 · 모델 · 인덱스 상태 (화면 상단 배지)."""
    engine: Engine = state["engine"]
    s = engine.settings
    info: dict[str, Any] = {
        "base_url": s.ollama_base_url,
        "model": s.model,
        "embedding_model": s.embedding_model,
        "connected": False,
        "model_ready": False,
        "embedding_ready": False,
        "error": None,
    }
    try:
        models = engine.models()
        info.update(
            connected=True,
            model_ready=engine.has_model(s.model, models),
            embedding_ready=engine.has_model(s.embedding_model, models),
        )
    except Exception as exc:
        info["error"] = f"{type(exc).__name__}: {exc}"
    info["index_ready"] = not engine.documents.is_empty()
    info["ok"] = all(info[k] for k in ("connected", "model_ready", "embedding_ready", "index_ready"))
    return info


@app.get("/api/results")
def results() -> dict[str, Any]:
    """저장된 판정 결과 전체. 아직 돌리지 않은 구역은 비어 있습니다."""
    return view.results(state["store"].load())


@app.get("/api/jobs")
def jobs() -> dict[str, Any]:
    """돌고 있는 작업과 진행 상황, 구역별 마지막 실행 결과."""
    return {**state["jobs"].status(), "kinds": KINDS}


@app.post("/api/jobs/{kind}", status_code=202)
def start_job(kind: str) -> dict[str, Any]:
    """권한 신청 검토 · 정책 관리 검토 · 로그 감시를 백그라운드로 시작합니다. 한 번에 하나만 돕니다."""
    if kind not in KINDS:
        raise HTTPException(status_code=404, detail=f"없는 작업입니다: {kind} (가능: {', '.join(KINDS)})")
    if not state["jobs"].start(kind):
        raise HTTPException(status_code=409, detail="다른 작업이 돌고 있습니다. 끝난 뒤 다시 시도하세요.")
    return jobs()


@app.get("/api/regulations")
def regulations() -> list[dict[str, str]]:
    """기준 문서 원문 (근거 조항 전문 표시용)."""
    return [
        {"name": p.name, "content": p.read_text(encoding="utf-8")}
        for p in sorted(DOCS_DIR.glob("*.md"))
    ]


@app.post("/api/review/{req_id}")
def review(req_id: str) -> dict[str, Any]:
    """권한 신청 1건 재판정. 결과는 저장된 판정에도 반영합니다."""
    if state["jobs"].status()["running"]:
        raise HTTPException(status_code=409, detail="다른 작업이 돌고 있습니다. 끝난 뒤 다시 시도하세요.")
    engine: Engine = state["engine"]
    result = pipeline.review_one(engine, engine.settings.requests_source, req_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"신청을 찾을 수 없습니다: {req_id}")
    state["store"].update_request(result)
    return view.permission(result)


class AskRequest(BaseModel):
    # 앞뒤 공백을 지운 뒤 길이를 봅니다. 공백만 보낸 질문도 422 가 됩니다.
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@app.post("/api/ask")
def ask(body: AskRequest) -> dict[str, Any]:
    """정책 질의응답. 기준 조항과 적재된 솔루션 규칙을 검색합니다 (신청 목록은 모름)."""
    answer, error, elapsed = pipeline.attempt(lambda: state["rag_chain"].invoke(body.question))
    if answer is None:
        answer = Answer(answer=f"답변 실패: {error}", sources=[])
    return {**answer.model_dump(), "elapsed_sec": round(elapsed, 1), "failed": error is not None}


@app.post("/api/ask-logs")
def ask_logs(body: AskRequest) -> dict[str, Any]:
    """로그 질의. 로그는 RAG 로 찾지 않고 코어가 조건에 맞춰 찾고 셉니다 (pipeline.ask_logs)."""
    engine: Engine = state["engine"]
    return pipeline.ask_logs(engine, engine.settings.events_source, body.question)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
