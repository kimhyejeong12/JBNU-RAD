"""수집 노드 API — 수집 받기는 로그인이 아니라 노드 키(Authorization: Bearer)로 확인합니다."""
from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, StringConstraints

from sentinelai.data.collected import NODE_NAME
from sentinelai.db import Denied, nodes, results

from .api_permissions import Approver

router = APIRouter(prefix="/api/nodes")

MAX_BODY = 2_000_000


def _known(name: str) -> str:
    if not NODE_NAME.match(name):
        raise HTTPException(status_code=404, detail="없는 노드입니다")
    return name


@router.post("/snapshots", status_code=201)
async def receive(request: Request) -> dict[str, Any]:
    presented = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not presented:
        raise HTTPException(status_code=401, detail="키가 없습니다")
    body = await request.body()
    if len(body) > MAX_BODY:
        raise HTTPException(status_code=413, detail="수집 본문이 너무 큽니다")
    try:
        return request.app.state.engine.receive_snapshot(presented, json.loads(body))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except nodes.Unauthorized as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from None
    except Denied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None


class NewNode(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


@router.post("", status_code=201)
def create_node(body: NewNode, request: Request, user: Approver) -> dict[str, Any]:
    try:
        node, key = nodes.create(request.app.state.main_db, user, body.name)
    except Denied as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {**node, "key": key}


@router.get("")
def list_nodes(request: Request, user: Approver) -> list[dict[str, Any]]:
    latest = {f["node"]: f for f in results.latest_node_findings(request.app.state.results_db)}
    return [{**n, "stale": nodes.is_stale(n), "level": latest[n["name"]]["level"] if n["name"] in latest else None,
             "finding_failed": latest[n["name"]]["failed"] if n["name"] in latest else False}
            for n in nodes.list_nodes(request.app.state.main_db)]


@router.get("/{name}")
def node_detail(name: str, request: Request, user: Approver) -> dict[str, Any]:
    found = [n for n in nodes.list_nodes(request.app.state.main_db) if n["name"] == _known(name)]
    if not found:
        raise HTTPException(status_code=404, detail="없는 노드입니다")
    return {**found[0], "stale": nodes.is_stale(found[0]), "key": nodes.key_of(request.app.state.main_db, user, name),
            **results.node_history(request.app.state.results_db, name)}


class NodeChange(BaseModel):
    enabled: bool


@router.patch("/{name}")
def change_node(name: str, body: NodeChange, request: Request, user: Approver) -> dict[str, Any]:
    try:
        return nodes.set_enabled(request.app.state.main_db, user, _known(name), body.enabled)
    except Denied as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/{name}/key")
def reissue_key(name: str, request: Request, user: Approver) -> dict[str, Any]:
    """예전 키는 바로 무효입니다."""
    try:
        node, key = nodes.reissue_key(request.app.state.main_db, user, _known(name))
    except Denied as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {**node, "key": key}
