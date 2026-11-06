"""FastAPI 백엔드 — `docker compose up` 후 http://localhost:8000"""
from __future__ import annotations

import json
import os
import uuid
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
    # Milvus Lite 는 한 프로세스만 열 수 있어 Engine 을 한 번만 만들고 AI 작업은 모두 그 통합 큐로 돌립니다.
    engine = Engine()
    engine.start()
    app.state.engine = engine
    app.state.main_db, app.state.results_db = engine.main_db, engine.results_db
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
    """돌던 판정 한 건은 끝날 때까지 이어지고 결과는 버립니다. rerun 이면 같은 작업을 다시 넣습니다."""
    reset = _engine(request).reset_jobs(rerun=body.rerun)
    if not reset:
        raise HTTPException(status_code=409, detail="돌고 있는 작업이 없습니다")
    with request.app.state.main_db.transaction() as conn:
        audit(conn, "jobs_reset", user.id, login_id=user.login_id, target_type="jobs", target_id=",".join(reset),
              detail=json.dumps({"rerun": body.rerun}, ensure_ascii=False), ip=request.client.host if request.client else None)
    return jobs(request)


@app.get("/api/queue")
def queue_detail(request: Request, _user: Annotated[User, Depends(role("top"))]) -> dict[str, Any]:
    return _engine(request).queue_detail()


@app.post("/api/queue/clear")
def clear_queue(request: Request, user: Annotated[User, Depends(role("top"))]) -> dict[str, Any]:
    """돌던 판정 한 건은 끝날 때까지 이어지고 결과는 버립니다. 도는 작업이 없어도 워커를 새로 띄웁니다."""
    cleared = _engine(request).clear_queue()
    with request.app.state.main_db.transaction() as conn:
        audit(conn, "queue_clear", user.id, login_id=user.login_id, target_type="jobs", target_id=",".join(sorted(set(cleared))),
              detail=json.dumps({"count": len(cleared)}, ensure_ascii=False), ip=request.client.host if request.client else None)
    return _engine(request).queue_detail()


@app.post("/api/jobs/{kind}", status_code=202, dependencies=analyst)
def start_job(kind: str, request: Request) -> dict[str, Any]:
    """큐에 넣습니다 (다른 작업이 돌면 그 뒤에). 같은 작업이 이미 기다리거나 돌고 있으면 409 입니다."""
    if kind not in MANUAL:
        raise HTTPException(status_code=404, detail=f"화면에서 시작할 수 없는 작업입니다: {kind} (가능: {', '.join(MANUAL)})")
    if not _engine(request).start_job(kind):
        raise HTTPException(status_code=409, detail="같은 작업이 이미 기다리거나 돌고 있습니다.")
    return jobs(request)


class AskRequest(BaseModel):
    # 앞뒤 공백을 지운 뒤 길이를 봐 공백만 보낸 질문도 422 가 됩니다.
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    conversation_id: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{32}$")] | None = None


@app.post("/api/ask")
def ask(body: AskRequest, request: Request, user: Approver) -> dict[str, Any]:
    """질의 에이전트 — 기준 문서 · 로그 · 서버 · 사람 · AI 판정을 도구로 찾아 답합니다. 같은 대화면 앞 턴을 이어 넣습니다."""
    db = request.app.state.results_db
    # 대화 id 는 화면이 만듭니다. 기록이 없는 id 면 새 대화이고, 읽기는 자기 기록만이라 남의 id 를 써도 이어지지 않습니다.
    history = results_db.my_conversation(db, user, body.conversation_id) if body.conversation_id else []
    conversation_id = body.conversation_id or uuid.uuid4().hex
    engine = _engine(request)
    out = engine.ask(body.question, user, history, request.client.host if request.client else None)
    record = results_db.save_qa(db, "agent", body.question, out, engine.settings.qa_model, user, conversation_id)
    return {**out, "id": record, "conversation_id": conversation_id}


Filter = Annotated[str, Query(max_length=200)]


@app.get("/api/stats")
def stats(request: Request, user: Approver, period: str = "month") -> dict[str, Any]:
    try:
        return _engine(request).stats(period)
    except ValueError as exc:  # 없는 기간
        raise HTTPException(status_code=422, detail=str(exc)) from None


@app.get("/api/risk-people")
def risk_people(request: Request, user: Approver) -> dict[str, Any]:
    """이동 · 퇴사한 사람의 위험 — 코드가 셈, 화면이 자주 다시 받습니다."""
    return _engine(request).risk_people()


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
def my_qa(request: Request, user: Approver, conversation: Annotated[str, Query(pattern=r"^[0-9a-f]{32}$")] | None = None) -> list[dict[str, Any]]:
    """내 대화 목록, conversation 을 주면 그 대화의 턴. 다른 사람의 질의는 주지 않습니다."""
    db = request.app.state.results_db
    return results_db.my_conversation(db, user, conversation) if conversation else results_db.my_conversations(db, user)


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
