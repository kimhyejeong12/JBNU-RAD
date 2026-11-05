"""FastAPI 백엔드 — `docker compose up` 후 http://localhost:8000"""
from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

# Milvus Lite 의 gRPC 경고를 숨깁니다. pymilvus 를 가져오기 전에 정해야 합니다.
os.environ.setdefault("GRPC_VERBOSITY", "NONE")

from fastapi import Depends, FastAPI, HTTPException, Query, Request  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, StringConstraints  # noqa: E402

from sentinelai.db import User, decisions, results as results_db  # noqa: E402
from sentinelai.db.core import audit  # noqa: E402
from sentinelai.engine import KINDS, MANUAL, Engine  # noqa: E402

from . import notify, view  # noqa: E402
from .api_permissions import Approver, role  # noqa: E402
from .api_permissions import router as permissions_router  # noqa: E402
from .api_nodes import router as nodes_router  # noqa: E402
from .api_regulations import router as regulations_router  # noqa: E402

STATIC_DIR = Path(__file__).resolve().parent / "static"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Milvus Lite 는 한 프로세스만 열 수 있어 Engine 을 한 번만 만들고 판정은 모두 그 작업 큐로 돌립니다.
    engine = Engine()
    engine.start()
    app.state.engine = engine
    app.state.main_db, app.state.results_db, app.state.verdicts = engine.main_db, engine.results_db, engine.verdicts
    app.state.slack_url = notify.slack_url()
    app.state.mail = notify.mail_settings()
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
app.include_router(regulations_router)

# 화면은 같은 출처에서만 열므로 CORS 를 열지 않습니다.
analyst = [Depends(role("manager", "top"))]


@app.get("/api/health", dependencies=analyst)
def health(request: Request) -> dict[str, Any]:
    return _engine(request).health()


@app.get("/api/results")
def results(request: Request, user: Approver) -> dict[str, Any]:
    """보안 총책임자에게는 결정 기록 전부(decision_log, 취소 포함)를 더 줍니다."""
    rdb, mdb = request.app.state.results_db, request.app.state.main_db
    out = {**view.results(results_db.latest_policy_review(rdb), results_db.monitor_findings(rdb), results_db.latest_node_findings(rdb)),
           "decisions": {kind: decisions.current(mdb, kind) for kind in decisions.ACTIONS}}
    log = {kind: decisions.history(mdb, kind) for kind in decisions.ACTIONS}
    _carry(rdb, out, log)
    if user.role == "top":
        out["decision_log"] = log
    return out


def _carry(rdb: Any, out: dict[str, Any], log: dict[str, dict[str, list[dict]]]) -> None:
    """다시 판정됐지만 결과가 그대로인 항목에 지난 결정을 잇습니다 (carried_from)."""
    current = {
        "server": [(s["key"], view.server_signature(s["id"], s["level"], s["gaps"])) for s in out["servers"]],
        "policy": [(i["key"], view.policy_signature(i["kind"], i["level"], i["policy_ids"])) for i in (out["policy_review"] or {}).get("issues", [])],
    }
    rows = results_db.findings_by_key(rdb, [k for kind in current for k in out["decisions"][kind]])
    signatures = {k: sig for k, row in rows.items() if (sig := view.row_signature(k, row)) is not None}
    for kind, items in current.items():
        out["decisions"][kind].update(view.carry_decisions(items, out["decisions"][kind], signatures, set(log[kind])))


@app.get("/api/jobs", dependencies=analyst)
def jobs(request: Request) -> dict[str, Any]:
    return {**_engine(request).job_status(), "kinds": KINDS}


class ResetJobs(BaseModel):
    rerun: bool = False


@app.post("/api/jobs/reset")
def reset_jobs(body: ResetJobs, request: Request, user: Annotated[User, Depends(role("top"))]) -> dict[str, Any]:
    """돌던 판정 한 건은 끝날 때까지 이어집니다. rerun 이면 같은 작업을 바로 다시 시작합니다."""
    reset = _engine(request).reset_jobs(rerun=body.rerun)
    if not reset:
        raise HTTPException(status_code=409, detail="돌고 있는 작업이 없습니다")
    with request.app.state.main_db.transaction() as conn:
        audit(conn, "jobs_reset", user.id, login_id=user.login_id, target_type="jobs", target_id=",".join(reset),
              detail=json.dumps({"rerun": body.rerun}, ensure_ascii=False), ip=request.client.host if request.client else None)
    return jobs(request)


@app.post("/api/jobs/{kind}", status_code=202, dependencies=analyst)
def start_job(kind: str, request: Request) -> dict[str, Any]:
    """백그라운드로 시작합니다. 한 번에 하나만 돌아 돌고 있으면 409 입니다."""
    if kind not in MANUAL:
        raise HTTPException(status_code=404, detail=f"화면에서 시작할 수 없는 작업입니다: {kind} (가능: {', '.join(MANUAL)})")
    if not _engine(request).jobs.start(kind):
        raise HTTPException(status_code=409, detail="다른 작업이 돌고 있습니다. 끝난 뒤 다시 시도하세요.")
    return jobs(request)


class AskRequest(BaseModel):
    # 앞뒤 공백을 지운 뒤 길이를 봐 공백만 보낸 질문도 422 가 됩니다.
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@app.post("/api/ask")
def ask(body: AskRequest, request: Request, user: Approver) -> dict[str, Any]:
    """기준 조항 · 솔루션 규칙을 검색합니다 (신청 목록은 모름)."""
    return _engine(request).ask(body.question, user)


@app.post("/api/ask-logs")
def ask_logs(body: AskRequest, request: Request, user: Approver) -> dict[str, Any]:
    """로그는 RAG 로 찾지 않고 코어가 조건에 맞춰 찾고 셉니다."""
    return _engine(request).ask_logs(body.question, user)


@app.post("/api/ask-servers")
def ask_servers(body: AskRequest, request: Request, user: Approver) -> dict[str, Any]:
    """서버 상태는 RAG 로 찾지 않고 코어가 수집 · 점검 기록을 골라 셉니다."""
    return _engine(request).ask_servers(body.question, user)


Filter = Annotated[str, Query(max_length=200)]


@app.get("/api/stats")
def stats(request: Request, user: Approver, period: str = "month") -> dict[str, Any]:
    try:
        return _engine(request).stats(period)
    except ValueError as exc:  # 없는 기간
        raise HTTPException(status_code=422, detail=str(exc)) from None


@app.get("/api/user-stats")
def user_stats(request: Request, user: Approver, period: str = "month") -> dict[str, Any]:
    try:
        return _engine(request).user_stats(period)
    except ValueError as exc:  # 없는 기간
        raise HTTPException(status_code=422, detail=str(exc)) from None


@app.get("/api/logs")
def browse_logs(request: Request, user: Approver, period: str,
                who: Annotated[str, Query(alias="user", max_length=200)] = "", solution: Filter = "", how: Filter = "",
                page: Annotated[int, Query(ge=1)] = 1) -> dict[str, Any]:
    """조회할 때마다 누가 어떤 조건으로 봤는지 감사 기록에 남깁니다."""
    try:
        return _engine(request).browse_logs(user, period, who, solution, how, page, request.client.host if request.client else None)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except ValueError as exc:  # 없는 기간 · 컬럼이 맞지 않는 로그 파일
        raise HTTPException(status_code=422, detail=str(exc)) from None


@app.get("/api/qa")
def my_qa(kind: str, request: Request, user: Approver) -> list[dict[str, Any]]:
    """다른 사람의 질의는 주지 않습니다."""
    if kind not in results_db.QA_KINDS:
        raise HTTPException(status_code=422, detail=f"kind 는 {', '.join(results_db.QA_KINDS)} 중 하나입니다")
    return list(reversed(results_db.my_qa(request.app.state.results_db, user, kind)))


# --- 내부 상태 (서버 자신만) ---


def local_only(request: Request) -> None:
    """프록시 뒤에서는 모두 127.0.0.1 로 보이므로 전달 헤더가 붙은 요청도 밖에서 온 것으로 404 를 냅니다."""
    host = request.client.host if request.client else ""
    forwarded = any(h in request.headers for h in ("x-forwarded-for", "x-real-ip", "forwarded"))
    if host not in ("127.0.0.1", "::1") or forwarded:
        raise HTTPException(status_code=404, detail="Not Found")


@app.get("/internal/status", dependencies=[Depends(local_only)])
def internal_status(request: Request) -> dict[str, Any]:
    """작업 큐 · 자동 실행 예약 · 권한 신청 판정 대기열 (화면은 쓰지 않음)."""
    return _engine(request).status()


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
