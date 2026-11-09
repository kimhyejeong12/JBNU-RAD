"""기준 문서 API — 원문은 권한 DB, RAG 는 그 사본. 지난 판정의 근거였으므로 고치거나 지운 원문 · 사유를 감사 기록에 남깁니다."""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, StringConstraints

from sentinelai.db import User, regulations as regs
from sentinelai.db.core import audit

from .api_permissions import role

MAX_CHARS = 1_000_000
# 위협 예측 · 정책 관리 검토가 수 분 걸려 넉넉히 기다립니다.
WAIT_LIMIT_SEC = 600
WAIT_STEP_SEC = 0.5
# 경로 구분자 없이, 점으로 시작하지 않고, .md · .txt 로 끝나는 이름입니다.
NAME = re.compile(r"[^./\\\x00][^/\\\x00]{0,95}\.(md|txt)", re.IGNORECASE)

router = APIRouter(prefix="/api/regulations", tags=["regulations"])
Top = Annotated[User, Depends(role("top"))]


async def _exclusive(request: Request, work: Callable[[], Any], failed: str) -> Any:
    """임베딩에 닿지 않으면 503. 큐에 넣고 차례를 기다립니다 — 기다리는 중에 화면이 끊으면 빼고 409."""
    engine = request.app.state.engine
    health = await run_in_threadpool(engine.health)
    if not (health.get("connected") and health.get("embedding_ready")):
        raise HTTPException(status_code=503, detail="AI 엔진에 닿지 않아 기준 문서를 적재할 수 없습니다. 엔진을 확인한 뒤 다시 하세요.")
    job = engine.exclusive(work)
    waited = 0.0
    while not job.finished.is_set():
        if await request.is_disconnected() and engine.queue.cancel(job.key, waiting_only=True):
            raise HTTPException(status_code=409, detail="취소했습니다")   # 받을 화면은 없지만 고치지 않고 멈춥니다
        if waited >= WAIT_LIMIT_SEC and engine.queue.cancel(job.key, waiting_only=True):
            raise HTTPException(status_code=409, detail="다른 작업이 10분 넘게 돌고 있습니다. 끝난 뒤 다시 하세요.")
        await asyncio.sleep(WAIT_STEP_SEC)
        waited += WAIT_STEP_SEC
    if job.status == "failed":
        raise HTTPException(status_code=502, detail=f"{failed}: {job.error}")
    if job.status != "done":
        raise HTTPException(status_code=409, detail="작업을 강제로 끝내 적용하지 않았습니다")
    return job.result


def _audit(request: Request, user: User, action: str, name: str, detail: dict[str, Any] | None = None) -> None:
    with request.app.state.main_db.transaction() as conn:
        audit(conn, action, user.id, login_id=user.login_id, target_type="regulation", target_id=name,
              detail=json.dumps(detail or {}, ensure_ascii=False), ip=request.client.host if request.client else None)


@router.get("", dependencies=[Depends(role("manager", "top"))])
def regulations(request: Request) -> list[dict[str, str]]:
    return regs.list_all(request.app.state.main_db)


class NewRegulation(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    content: Annotated[str, StringConstraints(min_length=1, max_length=MAX_CHARS)]


@router.post("", status_code=201)
async def upload(body: NewRegulation, request: Request, user: Top) -> dict[str, str]:
    """같은 이름은 덮어쓰지 않고, 적재가 실패하면 올린 문서를 지웁니다."""
    if not NAME.fullmatch(body.name):
        raise HTTPException(status_code=400, detail="기준 문서는 .md · .txt 파일만 올립니다 (이름에 / 없이 100자까지)")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="빈 문서는 올릴 수 없습니다")
    db, engine = request.app.state.main_db, request.app.state.engine
    if regs.get(db, body.name):
        raise HTTPException(status_code=400, detail="같은 이름의 기준 문서가 있습니다. 다른 이름으로 올리세요")

    def work() -> None:
        if not regs.create(db, user, body.name, body.content):
            raise ValueError("같은 이름의 기준 문서가 있습니다")
        try:
            engine.index()
        except Exception:
            regs.restore(db, body.name, None)
            raise

    await _exclusive(request, work, "적재하지 못해 올리지 않았습니다")
    _audit(request, user, "regulation_upload", body.name, {"chars": len(body.content)})
    return regs.get(db, body.name)



class EditRegulation(BaseModel):
    content: Annotated[str, StringConstraints(min_length=1, max_length=MAX_CHARS)]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@router.put("/{name}")
async def edit(name: str, body: EditRegulation, request: Request, user: Top) -> dict[str, str]:
    """그 문서만 다시 적재하고, 실패하면 원래 글로 되돌립니다."""
    db, engine = request.app.state.main_db, request.app.state.engine
    row = regs.get(db, name)
    if row is None:
        raise HTTPException(status_code=404, detail="그 기준 문서가 없습니다")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="빈 문서로 고칠 수 없습니다")
    before = row["content"]
    if body.content == before:
        raise HTTPException(status_code=400, detail="바뀐 내용이 없습니다")

    def work() -> None:
        regs.update(db, user, name, body.content)
        try:
            engine.index()
        except Exception:
            # RAG 에서 예전 조각이 빠졌어도 다음 적재 때 원래 글로 다시 들어갑니다.
            regs.restore(db, name, before)
            raise

    await _exclusive(request, work, "적재하지 못해 고치지 않았습니다")
    _audit(request, user, "regulation_edit", name, {"reason": body.reason, "chars": len(body.content), "before": before})
    return regs.get(db, name)


class RemoveRegulation(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@router.delete("/{name}")
async def remove(name: str, body: RemoveRegulation, request: Request, user: Top) -> dict[str, str]:
    """RAG 에서 빼지 못하면 문서를 되돌립니다. 마지막 문서는 지우지 않습니다."""
    db, engine = request.app.state.main_db, request.app.state.engine
    row = regs.get(db, name)
    if row is None:
        raise HTTPException(status_code=404, detail="그 기준 문서가 없습니다")
    if len(regs.texts(db)) <= 1:
        raise HTTPException(status_code=400, detail="마지막 기준 문서는 지울 수 없습니다. 새 문서를 먼저 올리세요")
    before = row["content"]

    def work() -> None:
        regs.delete(db, user, name)
        try:
            engine.index()
        except Exception:
            regs.restore(db, name, before)
            raise

    await _exclusive(request, work, "RAG 에서 빼지 못해 지우지 않았습니다")
    _audit(request, user, "regulation_remove", name, {"reason": body.reason, "before": before})
    return {"name": name}
