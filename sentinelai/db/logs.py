"""Log DB — AI 판정. 지금은 권한 신청 판정만 둡니다 (보안 솔루션 로그 · 로그 감시 판정은 나중에)."""
from __future__ import annotations

import json

from .core import Database, now


def save_request_verdict(db: Database, request_no: str, result: dict, model: str) -> int:
    """pipeline.judge_request 의 결과를 남깁니다. 반환값이 권한 DB 결재 기록의 ai_verdict_ref 가 됩니다."""
    with db.transaction() as conn:
        return conn.execute(
            "INSERT INTO request_verdicts (request_no, level, reason, recommendation, sources, failed, error, model, elapsed_sec, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (request_no, result.get("level"), result.get("reason", ""), result.get("recommendation", ""),
             json.dumps(result.get("sources", []), ensure_ascii=False), int(result["failed"]), result.get("error"),
             model, result.get("elapsed_sec"), now()),
        ).lastrowid


def latest_request_verdict(db: Database, request_no: str) -> dict | None:
    with db.connection() as conn:
        row = conn.execute(
            "SELECT * FROM request_verdicts WHERE request_no = ? ORDER BY created_at DESC, id DESC LIMIT 1", (request_no,)
        ).fetchone()
    if row is None:
        return None
    verdict = dict(row)
    verdict["sources"] = json.loads(verdict["sources"])
    verdict["failed"] = bool(verdict["failed"])
    return verdict


def unjudged(db: Database, request_nos: list[str]) -> list[str]:
    """성공한 판정이 없는 신청 번호. 웹을 다시 띄웠을 때 밀렸거나 실패한 판정을 다시 돌립니다."""
    if not request_nos:
        return []
    with db.connection() as conn:
        done = {r[0] for r in conn.execute(
            f"SELECT DISTINCT request_no FROM request_verdicts WHERE failed = 0 AND request_no IN ({','.join('?' * len(request_nos))})",
            request_nos)}
    return [no for no in request_nos if no not in done]
