"""돌려준 값이 선언한 모양(responses.py)과 같은지 대조합니다 — 시험과 `python -m sentinelai.dev api-check` 가 함께 씁니다."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, routing
from fastapi.encoders import jsonable_encoder
from fastapi.routing import APIRoute
from pydantic import TypeAdapter, ValidationError

UNDECLARED = "선언에 없는 칸"


def _diff(wire: Any, back: Any, at: str = "$") -> list[str]:
    """실제 값(wire)과 선언을 거친 값(back)의 다른 곳 — 참 · 거짓과 숫자는 다른 종류로 봅니다."""
    if isinstance(wire, dict) and isinstance(back, dict):
        out = []
        for k in wire.keys() | back.keys():
            if k not in back:
                out.append(f"{at}.{k}: {UNDECLARED}")
            elif k not in wire:
                out.append(f"{at}.{k}: 실제에 없는 칸을 선언이 만듦")
            else:
                out += _diff(wire[k], back[k], f"{at}.{k}")
        return out
    if isinstance(wire, list) and isinstance(back, list):
        if len(wire) != len(back):
            return [f"{at}: 길이 {len(wire)} != {len(back)}"]
        return [d for i, (x, y) in enumerate(zip(wire, back)) for d in _diff(x, y, f"{at}[{i}]")]
    number = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)  # noqa: E731
    if number(wire) and number(back):
        return [] if wire == back else [f"{at}: {wire!r} != {back!r}"]
    return [] if type(wire) is type(back) and wire == back else [f"{at}: {wire!r} != {back!r}"]


def _errors(exc: ValidationError) -> list[str]:
    return [f"$.{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()]


def mismatch(model: Any, payload: Any) -> list[str]:
    """응답을 건드리지 않는 API 용 — payload 가 model 과 어긋나는 곳(종류가 다른 칸 · 선언에 없는 칸 · 빠진 칸)."""
    wire = jsonable_encoder(payload)
    adapter = TypeAdapter(model)
    try:
        parsed = adapter.validate_python(wire, strict=True)
    except ValidationError as exc:
        return _errors(exc)
    return _diff(wire, adapter.dump_python(parsed, mode="json", exclude_unset=True))


def unfit(model: Any, payload: Any) -> list[str]:
    """응답을 선언에 맞추는 API(response_model) 용 — 맞추다 실패해 500 이 날 곳과, 선언에 없어 응답에서 빠질 칸."""
    wire = jsonable_encoder(payload)
    adapter = TypeAdapter(model)
    try:
        parsed = adapter.validate_python(wire)
    except ValidationError as exc:
        return _errors(exc)
    return [d for d in _diff(wire, adapter.dump_python(parsed, mode="json", exclude_unset=True)) if d.endswith(UNDECLARED)]


def _routes(app: FastAPI) -> list[tuple[str, APIRoute]]:
    """(실제 경로, 라우트) — 새 FastAPI 는 포함한 라우터를 app.routes 에 펼쳐 두지 않아 펼쳐 주는 함수로 읽습니다."""
    walk = getattr(routing, "iter_route_contexts", None)
    if walk is None:
        return [(r.path, r) for r in app.routes if isinstance(r, APIRoute)]
    return [(c.path, c.original_route) for c in walk(app.routes) if isinstance(c.original_route, APIRoute)]


def declared(app: FastAPI) -> list[tuple[str, Any, bool]]:
    """조건 없이 읽을 수 있는 API(GET, 경로 변수 없음) → (경로, 선언한 모양, 응답을 선언에 맞추는지)."""
    out = []
    for path, route in _routes(app):
        if "GET" not in route.methods or not path.startswith("/api/") or "{" in path:
            continue
        # 명세에만 올린 모양(responses)이 있으면 그쪽입니다 — 그런 라우트의 response_model 은 dict 같은 돌려주는 값의 주석일 뿐입니다.
        shown = (route.responses.get(200) or {}).get("model")
        model = shown if shown is not None else route.response_model
        if model is not None:
            out.append((path, model, shown is None))
    return sorted(out, key=lambda r: r[0])
