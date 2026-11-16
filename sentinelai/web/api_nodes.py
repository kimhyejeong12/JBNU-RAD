"""수집 노드 API — 수집 받기는 로그인이 아니라 노드 키(Authorization: Bearer)로 확인합니다."""
from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, StringConstraints

from sentinelai.sources import NODE_NAME
from sentinelai.db import Denied, nodes, results

from .api_permissions import Approver, Level

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


class Node(BaseModel):
    """수집 노드 한 대 — 키 자체는 빼고 발급 여부만."""

    name: str
    host: str
    ip: str
    agent_version: str
    interval_min: int
    registered_at: str
    last_seen_at: str | None
    last_collected_at: str | None
    enabled: bool
    key_issued: bool


class NodeWithKey(Node):
    """등록하거나 키를 다시 발급한 결과."""

    key: str


class NodeRow(Node):
    """노드 목록의 한 줄 — stale 은 간격의 세 배 넘게 소식 없음, level 은 마지막 서버 점검 등급."""

    stale: bool
    level: Level | None
    finding_failed: bool


class NewNode(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


@router.post("", status_code=201, response_model=NodeWithKey)
def create_node(body: NewNode, request: Request, user: Approver) -> dict[str, Any]:
    try:
        node, key = nodes.create(request.app.state.main_db, user, body.name)
    except Denied as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {**node, "key": key}


@router.get("", response_model=list[NodeRow])
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


@router.patch("/{name}", response_model=Node)
def change_node(name: str, body: NodeChange, request: Request, user: Approver) -> dict[str, Any]:
    try:
        return nodes.set_enabled(request.app.state.main_db, user, _known(name), body.enabled)
    except Denied as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.post("/{name}/key", response_model=NodeWithKey)
def reissue_key(name: str, request: Request, user: Approver) -> dict[str, Any]:
    """예전 키는 바로 무효입니다."""
    try:
        node, key = nodes.reissue_key(request.app.state.main_db, user, _known(name))
    except Denied as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {**node, "key": key}
