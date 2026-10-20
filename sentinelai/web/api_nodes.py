"""수집 노드 API — 노드가 보내는 수집 받기 · 화면의 노드 목록 · 끄기 · 키 초기화.

수집 받기는 사람의 로그인이 아니라 노드의 토큰 · 키로 확인합니다 (Authorization: Bearer).
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from sentinelai.data.collected import NODE_NAME
from sentinelai.db import Denied, nodes, results

from .api_permissions import Approver

router = APIRouter(prefix="/api/nodes")

MAX_BODY = 2_000_000


def _known(name: str) -> str:
    if not NODE_NAME.match(name):
        raise HTTPException(status_code=404, detail="없는 노드입니다")
    return name


@router.post("/{name}/snapshots", status_code=201)
async def receive(name: str, request: Request) -> dict[str, Any]:
    """노드가 한 번 읽은 수집을 받아 쌓습니다. 처음 보내는 노드는 등록 토큰으로 등록되고 이 노드만의 키를 받습니다."""
    _known(name)
    presented = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not presented:
        raise HTTPException(status_code=401, detail="토큰이 없습니다")
    body = await request.body()
    if len(body) > MAX_BODY:
        raise HTTPException(status_code=413, detail="수집 본문이 너무 큽니다")
    try:
        return request.app.state.engine.receive_snapshot(name, presented, json.loads(body))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except nodes.Unauthorized as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from None
    except Denied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None


@router.get("")
def list_nodes(request: Request, user: Approver) -> list[dict[str, Any]]:
    """노드 목록 — 등록부 + 끊김 여부 + 마지막 판정 등급."""
    latest = {f["node"]: f for f in results.latest_node_findings(request.app.state.results_db)}
    return [{**n, "stale": nodes.is_stale(n), "level": latest[n["name"]]["level"] if n["name"] in latest else None,
             "finding_failed": latest[n["name"]]["failed"] if n["name"] in latest else False}
            for n in nodes.list_nodes(request.app.state.main_db)]


@router.get("/{name}")
def node_detail(name: str, request: Request, user: Approver) -> dict[str, Any]:
    """노드 하나 — 등록부 · 가장 늦은 수집의 모듈 상태 · 최근 수집(바뀐 것) · 판정 기록."""
    found = [n for n in nodes.list_nodes(request.app.state.main_db) if n["name"] == _known(name)]
    if not found:
        raise HTTPException(status_code=404, detail="없는 노드입니다")
    return {**found[0], "stale": nodes.is_stale(found[0]), **results.node_history(request.app.state.results_db, name)}


class NodeChange(BaseModel):
    enabled: bool


@router.patch("/{name}")
def change_node(name: str, body: NodeChange, request: Request, user: Approver) -> dict[str, Any]:
    try:
        return nodes.set_enabled(request.app.state.main_db, user, _known(name), body.enabled)
    except Denied as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/{name}/reset-key")
def reset_key(name: str, request: Request, user: Approver) -> dict[str, Any]:
    """다시 깐 노드가 등록 토큰으로 새 키를 받을 수 있게 지금 키를 지웁니다."""
    try:
        return nodes.reset_key(request.app.state.main_db, user, _known(name))
    except Denied as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
