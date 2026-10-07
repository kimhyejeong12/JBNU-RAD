"""FastAPI 백엔드 — `make web` 후 http://localhost:8000"""
from __future__ import annotations

import json
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

from sentinelai.engine import Answer, Engine  # noqa: E402

from .loader import DATA_DIR, ROOT, load_permissions  # noqa: E402
from .review import _attempt, review_permission  # noqa: E402

RESULTS_JSON = DATA_DIR / "results.json"
ASK_JSON = DATA_DIR / "ask_results.json"
DOCS_DIR = ROOT / "docs"
STATIC_DIR = Path(__file__).resolve().parent / "static"

state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Engine 은 앱 시작 시 1회만 만듭니다. 요청마다 만들면 모델 로딩이 반복됩니다.
    state["engine"] = Engine()
    state["review_chain"] = state["engine"].review_chain()
    state["rag_chain"] = state["engine"].rag_chain(structured=True)
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
    """미리 계산한 판정 결과. 화면은 이것만 읽습니다."""
    if not RESULTS_JSON.exists():
        raise HTTPException(
            status_code=503,
            detail="data/results.json 이 없습니다. 먼저 `make precompute` 를 실행하세요.",
        )
    return json.loads(RESULTS_JSON.read_text(encoding="utf-8"))


@app.get("/api/asks")
def ask_results() -> dict[str, Any]:
    """미리 계산한 권한 질의 예시 답변. 화면의 예시 질문 버튼은 이것만 읽습니다."""
    if not ASK_JSON.exists():
        raise HTTPException(
            status_code=503,
            detail="data/ask_results.json 이 없습니다. 먼저 `make precompute-ask` 를 실행하세요.",
        )
    return json.loads(ASK_JSON.read_text(encoding="utf-8"))


@app.get("/api/regulations")
def regulations() -> list[dict[str, str]]:
    """기준 문서 원문 (근거 조항 전문 표시용)."""
    return [
        {"name": p.name, "content": p.read_text(encoding="utf-8")}
        for p in sorted(DOCS_DIR.glob("*.md"))
    ]


@app.post("/api/review/{req_id}")
def review(req_id: str) -> dict[str, Any]:
    """권한 신청 1건 실시간 재판정. 맥 qwen2.5:7b 기준 수십 초~수 분 걸립니다."""
    row = next((r for r in load_permissions() if r["id"] == req_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail=f"신청을 찾을 수 없습니다: {req_id}")
    result, error = review_permission(state["review_chain"], row)
    return {**result, "failed": error is not None}


class AskRequest(BaseModel):
    # 앞뒤 공백을 지운 뒤 길이를 봅니다. 공백만 보낸 질문도 422 가 됩니다.
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@app.post("/api/ask")
def ask(body: AskRequest) -> dict[str, Any]:
    """기준 문서 질의응답. docs/ 만 검색하므로 신청 목록 · 정책 표는 모릅니다."""
    answer, error, elapsed = _attempt(lambda: state["rag_chain"].invoke(body.question))
    if answer is None:
        answer = Answer(answer=f"답변 실패: {error}", sources=[])
    return {**answer.model_dump(), "elapsed_sec": round(elapsed, 1), "failed": error is not None}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
