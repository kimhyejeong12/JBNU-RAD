"""기준 문서 API — 보기(보안 운영자 이상) · 올리기 · 고치기(보안 총책임자).

기준 문서는 docs/ 의 .md · .txt 이고 RAG 에 적재되어 판정의 근거가 됩니다. 엔진은 고치지 않고 엔진이 내놓은 기능만 씁니다.
- 올리면 바뀐 파일만 다시 적재합니다 (Engine.index). 적재가 실패하면 올린 파일을 지웁니다.
- 고치면 그 문서만 다시 적재합니다 — 같은 이름의 내용이 바뀌면 엔진이 그 문서의 예전 조각만 바꿉니다.
  지난 판정이 고치기 전 조항을 근거로 했으므로 고치기 전 원문 · 사유를 감사 기록에 남깁니다.
- 지우면 docs/ 의 파일을 지우고 그 문서의 조각만 RAG 에서 뺍니다 (Engine.remove_document). 지운 원문 · 사유는 감사 기록에 남깁니다.
  마지막 문서는 지우지 않습니다 — 판정할 근거가 없어지고, 비어 있는 docs/ 는 적재가 실패합니다.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, StringConstraints

from sentinelai import ROOT
from sentinelai.db import User
from sentinelai.db.core import audit

from .api_permissions import role

DOCS_DIR = ROOT / "docs"
SUFFIXES = (".md", ".txt")
MAX_CHARS = 1_000_000
# AI 작업이 도는 동안에는 끝나기를 기다렸다가 적재합니다 (위협 예측 · 정책 관리 검토가 수 분 걸림).
WAIT_LIMIT_SEC = 600
WAIT_STEP_SEC = 2
# 파일 이름 — 경로 구분자 없이, 점으로 시작하지 않고, .md · .txt 로 끝남 (한글 이름 그대로).
NAME = re.compile(r"[^./\\\x00][^/\\\x00]{0,95}\.(md|txt)", re.IGNORECASE)

router = APIRouter(prefix="/api/regulations", tags=["regulations"])
Top = Annotated[User, Depends(role("top"))]


def _files() -> list[Path]:
    return sorted(p for p in DOCS_DIR.iterdir() if p.is_file() and p.suffix.lower() in SUFFIXES)


def _entry(p: Path) -> dict[str, str]:
    return {
        "name": p.name,
        "content": p.read_text(encoding="utf-8"),
        "updated_at": datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat(),
    }


def _busy(engine: Any) -> bool:
    status = engine.job_status()
    return bool(status.get("running") or (status.get("fast") or {}).get("running"))


async def _ready(request: Request) -> Any:
    """임베딩 모델에 닿는지 먼저 보고(503), 다른 작업이 RAG 를 쓰는 중이면 끝나기를 기다립니다.

    작업 큐는 엔진 것이라 끼워 넣을 수 없어, 쉬는 것을 본 뒤 바로 적재합니다 — 그 사이 자동 작업이 시작되면 겹칠 수 있습니다 (NOTES.md).
    기다리는 동안 화면이 [취소]로 요청을 끊으면 멈춥니다 (적재 직전에도 한 번 더 봅니다).
    """
    engine = request.app.state.engine
    health = await run_in_threadpool(engine.health)
    if not (health.get("connected") and health.get("embedding_ready")):
        raise HTTPException(status_code=503, detail="AI 엔진에 닿지 않아 기준 문서를 적재할 수 없습니다. 엔진을 확인한 뒤 다시 하세요.")
    waited = 0
    while _busy(engine):
        if await request.is_disconnected():
            break
        if waited >= WAIT_LIMIT_SEC:
            raise HTTPException(status_code=409, detail="다른 작업이 10분 넘게 돌고 있습니다. 끝난 뒤 다시 하세요.")
        await asyncio.sleep(WAIT_STEP_SEC)
        waited += WAIT_STEP_SEC
    if await request.is_disconnected():
        raise HTTPException(status_code=409, detail="취소했습니다")   # 받을 화면은 없지만 여기서 멈춰 고치지 않습니다
    return engine


def _audit(request: Request, user: User, action: str, name: str, detail: dict[str, Any] | None = None) -> None:
    with request.app.state.main_db.transaction() as conn:
        audit(conn, action, user.id, login_id=user.login_id, target_type="regulation", target_id=name,
              detail=json.dumps(detail or {}, ensure_ascii=False), ip=request.client.host if request.client else None)


@router.get("", dependencies=[Depends(role("manager", "top"))])
def regulations() -> list[dict[str, str]]:
    """기준 문서 원문과 고친 시각 (근거 조항 전문 표시 · 보안 총책임자의 기준 문서 목록)."""
    return [_entry(p) for p in _files()]


class NewRegulation(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    content: Annotated[str, StringConstraints(min_length=1, max_length=MAX_CHARS)]


@router.post("", status_code=201)
async def upload(body: NewRegulation, request: Request, user: Top) -> dict[str, str]:
    """기준 문서 올리기 — docs/ 에 저장하고 바로 적재합니다. 같은 이름은 올리지 않습니다 (덮어쓰지 않음)."""
    if not NAME.fullmatch(body.name):
        raise HTTPException(status_code=400, detail="기준 문서는 .md · .txt 파일만 올립니다 (이름에 / 없이 100자까지)")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="빈 문서는 올릴 수 없습니다")
    path = DOCS_DIR / body.name
    if path.exists():
        raise HTTPException(status_code=400, detail="같은 이름의 기준 문서가 있습니다. 다른 이름으로 올리세요")
    engine = await _ready(request)
    path.write_text(body.content, encoding="utf-8")
    try:
        await run_in_threadpool(engine.index)
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=502, detail=f"적재하지 못해 올리지 않았습니다: {exc}") from None
    _audit(request, user, "regulation_upload", body.name, {"chars": len(body.content)})
    return _entry(path)



class EditRegulation(BaseModel):
    content: Annotated[str, StringConstraints(min_length=1, max_length=MAX_CHARS)]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@router.put("/{name}")
async def edit(name: str, body: EditRegulation, request: Request, user: Top) -> dict[str, str]:
    """기준 문서 고치기 — 저장하고 그 문서만 다시 적재합니다. 적재가 실패하면 원래 글로 되돌립니다."""
    path = DOCS_DIR / name
    if not NAME.fullmatch(name) or not path.is_file():
        raise HTTPException(status_code=404, detail="그 기준 문서가 없습니다")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="빈 문서로 고칠 수 없습니다")
    before = path.read_text(encoding="utf-8")
    if body.content == before:
        raise HTTPException(status_code=400, detail="바뀐 내용이 없습니다")
    engine = await _ready(request)
    path.write_text(body.content, encoding="utf-8")
    try:
        await run_in_threadpool(engine.index)
    except Exception as exc:
        # RAG 에서 예전 조각이 이미 빠졌을 수 있지만, 다음 적재(정책 관리 검토 · 올리기 · 고치기) 때 원래 글로 다시 들어갑니다.
        path.write_text(before, encoding="utf-8")
        raise HTTPException(status_code=502, detail=f"적재하지 못해 고치지 않았습니다: {exc}") from None
    _audit(request, user, "regulation_edit", name, {"reason": body.reason, "chars": len(body.content), "before": before})
    return _entry(path)


class RemoveRegulation(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


@router.delete("/{name}")
async def remove(name: str, body: RemoveRegulation, request: Request, user: Top) -> dict[str, str]:
    """기준 문서 지우기 — 파일을 지우고 그 문서만 RAG 에서 뺍니다. RAG 에서 빼지 못하면 파일을 되돌립니다."""
    path = DOCS_DIR / name
    if not NAME.fullmatch(name) or not path.is_file():
        raise HTTPException(status_code=404, detail="그 기준 문서가 없습니다")
    if len(_files()) <= 1:
        raise HTTPException(status_code=400, detail="마지막 기준 문서는 지울 수 없습니다. 새 문서를 먼저 올리세요")
    before = path.read_text(encoding="utf-8")
    engine = await _ready(request)
    path.unlink()
    try:
        await run_in_threadpool(engine.remove_document, name)
    except Exception as exc:
        path.write_text(before, encoding="utf-8")
        raise HTTPException(status_code=502, detail=f"RAG 에서 빼지 못해 지우지 않았습니다: {exc}") from None
    _audit(request, user, "regulation_remove", name, {"reason": body.reason, "before": before})
    return {"name": name}
