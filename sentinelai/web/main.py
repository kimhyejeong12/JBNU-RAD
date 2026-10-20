"""FastAPI 백엔드 — `make web` 후 http://localhost:8000"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

# Milvus Lite 의 gRPC keepalive 경고를 숨깁니다 (동작 영향 없음). import 전에 설정해야 합니다.
os.environ.setdefault("GRPC_VERBOSITY", "NONE")

from fastapi import Depends, FastAPI, HTTPException, Query, Request  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, StringConstraints  # noqa: E402

from sentinelai import ROOT  # noqa: E402
from sentinelai.db import decisions, results as results_db  # noqa: E402
from sentinelai.engine import KINDS, MANUAL, Engine  # noqa: E402

from . import view  # noqa: E402
from .api_permissions import Approver, role  # noqa: E402
from .api_permissions import router as permissions_router  # noqa: E402
from .api_nodes import router as nodes_router  # noqa: E402

DOCS_DIR = ROOT / "docs"
STATIC_DIR = Path(__file__).resolve().parent / "static"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Engine 은 앱 시작 시 1회만 만듭니다. 모델 · DB · 작업 큐가 모두 여기 있습니다.
    # Milvus Lite 는 한 프로세스만 DB 를 열 수 있으므로, 웹이 떠 있는 동안 판정은 모두 Engine 의 작업 큐로 돌립니다.
    engine = Engine()
    engine.start()
    app.state.engine = engine
    app.state.main_db, app.state.results_db, app.state.verdicts = engine.main_db, engine.results_db, engine.verdicts
    yield
    engine.stop()


def _engine(request: Request) -> Engine:
    return request.app.state.engine


app = FastAPI(
    title="SentinelAI",
    lifespan=lifespan,
)
app.include_router(permissions_router)
app.include_router(nodes_router)

# 정책 관리 · 로그 감시 화면은 보안 운영자 · 보안 총책임자만 씁니다. 화면은 같은 출처에서만 열므로 CORS 를 열지 않습니다.
analyst = [Depends(role("manager", "top"))]


@app.get("/api/health", dependencies=analyst)
def health(request: Request) -> dict[str, Any]:
    """Ollama 연결 · 모델 · 인덱스 상태 (화면 상단 배지)."""
    return _engine(request).health()


@app.get("/api/results")
def results(request: Request, user: Approver) -> dict[str, Any]:
    """마지막 정책 관리 검토 · 쌓인 로그 감시 판정과 항목별 운영자 결정. 아직 돌리지 않은 구역은 비어 있습니다.

    보안 총책임자에게는 항목별 결정 기록 전부(decision_log, 취소 포함)를 더 줍니다. 아래에서 올라온 판단을 읽는 자리입니다.
    """
    rdb, mdb = request.app.state.results_db, request.app.state.main_db
    out = {**view.results(results_db.latest_policy_review(rdb), results_db.monitor_findings(rdb), results_db.latest_node_findings(rdb)),
           "decisions": {kind: decisions.current(mdb, kind) for kind in decisions.ACTIONS}}
    if user.role == "top":
        out["decision_log"] = {kind: decisions.history(mdb, kind) for kind in decisions.ACTIONS}
    return out


@app.get("/api/jobs", dependencies=analyst)
def jobs(request: Request) -> dict[str, Any]:
    """돌고 있는 작업과 진행 상황, 구역별 마지막 실행 결과."""
    return {**_engine(request).jobs.status(), "kinds": KINDS}


@app.post("/api/jobs/{kind}", status_code=202, dependencies=analyst)
def start_job(kind: str, request: Request) -> dict[str, Any]:
    """정책 관리 검토 · 서버 점검을 백그라운드로 시작합니다. 한 번에 하나만 돕니다. 서버 점검 · 로그 감시는 서버가 정해진 간격마다 스스로도 돌립니다."""
    if kind not in MANUAL:
        raise HTTPException(status_code=404, detail=f"화면에서 시작할 수 없는 작업입니다: {kind} (가능: {', '.join(MANUAL)})")
    if not _engine(request).jobs.start(kind):
        raise HTTPException(status_code=409, detail="다른 작업이 돌고 있습니다. 끝난 뒤 다시 시도하세요.")
    return jobs(request)


@app.get("/api/regulations", dependencies=analyst)
def regulations() -> list[dict[str, str]]:
    """기준 문서 원문 (근거 조항 전문 표시용)."""
    return [
        {"name": p.name, "content": p.read_text(encoding="utf-8")}
        for p in sorted(DOCS_DIR.glob("*.md"))
    ]


class AskRequest(BaseModel):
    # 앞뒤 공백을 지운 뒤 길이를 봅니다. 공백만 보낸 질문도 422 가 됩니다.
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@app.post("/api/ask")
def ask(body: AskRequest, request: Request, user: Approver) -> dict[str, Any]:
    """정책 질의응답. 기준 조항과 적재된 솔루션 규칙을 검색합니다 (신청 목록은 모름). 질의 기록에 남깁니다."""
    return _engine(request).ask(body.question, user)


@app.post("/api/ask-logs")
def ask_logs(body: AskRequest, request: Request, user: Approver) -> dict[str, Any]:
    """로그 질의. 로그는 RAG 로 찾지 않고 코어가 조건에 맞춰 찾고 셉니다. 질의 기록에 남깁니다."""
    return _engine(request).ask_logs(body.question, user)


Filter = Annotated[str, Query(max_length=200)]


@app.get("/api/logs")
def browse_logs(request: Request, user: Approver, period: str,
                who: Annotated[str, Query(alias="user", max_length=200)] = "", solution: Filter = "", how: Filter = "",
                page: Annotated[int, Query(ge=1)] = 1) -> dict[str, Any]:
    """로그 조회 — 지금부터 period(day · week · month · quarter · half · year · all), 사용자(user = "부서 이름") 등으로 거릅니다.

    모델을 부르지 않습니다. 거르기 칸의 값(options)도 함께 줍니다. 조회할 때마다 누가 어떤 조건으로 봤는지 감사 기록에 남깁니다.
    """
    try:
        return _engine(request).browse_logs(user, period, who, solution, how, page, request.client.host if request.client else None)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except ValueError as exc:  # 없는 기간 · 컬럼이 맞지 않는 로그 파일
        raise HTTPException(status_code=422, detail=str(exc)) from None


@app.get("/api/qa")
def my_qa(kind: str, request: Request, user: Approver) -> list[dict[str, Any]]:
    """내 질의 기록 (최근 50건, 오래된 것부터). 다른 사람의 질의는 주지 않습니다."""
    if kind not in results_db.QA_KINDS:
        raise HTTPException(status_code=422, detail=f"kind 는 {', '.join(results_db.QA_KINDS)} 중 하나입니다")
    return list(reversed(results_db.my_qa(request.app.state.results_db, user, kind)))


# --- 내부 상태 (서버 자신만) ---------------------------------------------------


def local_only(request: Request) -> None:
    """서버 자신(127.0.0.1)에서 온 요청만 받습니다. 없는 주소처럼 404 로 막습니다.

    역방향 프록시 뒤에서는 모든 요청이 127.0.0.1 에서 온 것처럼 보이므로, 전달 헤더가 붙은 요청은 밖에서 온 것으로 봅니다.
    """
    host = request.client.host if request.client else ""
    forwarded = any(h in request.headers for h in ("x-forwarded-for", "x-real-ip", "forwarded"))
    if host not in ("127.0.0.1", "::1") or forwarded:
        raise HTTPException(status_code=404, detail="Not Found")


@app.get("/internal/status", dependencies=[Depends(local_only)])
def internal_status(request: Request) -> dict[str, Any]:
    """웹 안에서 도는 것 — 작업 큐(진행 · 마지막 결과) · 자동 실행 예약 · 권한 신청 AI 판정 대기열. 화면은 쓰지 않습니다.

    서버에서 `curl -s localhost:8000/internal/status` 로 봅니다.
    """
    return _engine(request).status()


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
