"""기준 문서 API — 보기(보안 운영자 이상) · 올리기(보안 총책임자).

기준 문서는 docs/ 의 .md · .txt 이고 RAG 에 적재되어 판정의 근거가 됩니다. 엔진은 고치지 않고 엔진이 내놓은 기능만 씁니다.
- 올리면 바뀐 파일만 다시 적재합니다 (Engine.index). 적재가 실패하면 올린 파일을 지웁니다.
- 지우기는 두지 않습니다 — 엔진에 문서 하나만 RAG 에서 빼는 기능이 없어 전체 재적재와 정책 관리 검토가 필요합니다 (NOTES.md).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, StringConstraints

from sentinelai import ROOT
from sentinelai.db import User
from sentinelai.db.core import audit

from .api_permissions import role

DOCS_DIR = ROOT / "docs"
SUFFIXES = (".md", ".txt")
MAX_CHARS = 1_000_000
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


def _ready(request: Request) -> Any:
    """다른 작업이 RAG 를 쓰는 중이거나 임베딩 모델에 닿지 않으면 올리지 않습니다."""
    engine = request.app.state.engine
    status = engine.job_status()
    if status.get("running") or (status.get("fast") or {}).get("running"):
        raise HTTPException(status_code=409, detail="다른 작업이 돌고 있습니다. 끝난 뒤 다시 하세요.")
    health = engine.health()
    if not (health.get("connected") and health.get("embedding_ready")):
        raise HTTPException(status_code=503, detail="AI 엔진에 닿지 않아 기준 문서를 올릴 수 없습니다. 엔진을 확인한 뒤 다시 하세요.")
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
def upload(body: NewRegulation, request: Request, user: Top) -> dict[str, str]:
    """기준 문서 올리기 — docs/ 에 저장하고 바로 적재합니다. 같은 이름은 올리지 않습니다 (덮어쓰지 않음)."""
    if not NAME.fullmatch(body.name):
        raise HTTPException(status_code=400, detail="기준 문서는 .md · .txt 파일만 올립니다 (이름에 / 없이 100자까지)")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="빈 문서는 올릴 수 없습니다")
    path = DOCS_DIR / body.name
    if path.exists():
        raise HTTPException(status_code=400, detail="같은 이름의 기준 문서가 있습니다. 다른 이름으로 올리세요")
    engine = _ready(request)
    path.write_text(body.content, encoding="utf-8")
    try:
        engine.index()
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=502, detail=f"적재하지 못해 올리지 않았습니다: {exc}") from None
    _audit(request, user, "regulation_upload", body.name, {"chars": len(body.content)})
    return _entry(path)

