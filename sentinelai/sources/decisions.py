"""운영자 결정 — 정책 관리 · 서버 점검 · 로그 감시 판정에 사람이 정한 것을 권한 DB · AI 결과 DB 에서 모읍니다 (오래된 것부터)."""
from __future__ import annotations

import json
from typing import Any

from ..db import Database, decisions, results

FIELDS = ("decided_at", "decider_name", "action", "comment")


def _pick(d: dict[str, Any], **more: Any) -> dict[str, Any]:
    return {**{k: d[k] for k in FIELDS}, **more}


def server(main_db: Database, results_db: Database, node: str) -> list[dict[str, Any]]:
    """이 노드의 지난 서버 점검에 정한 것 — items = 그때 정책과 다른 곳(정상 제외)."""
    current = decisions.current(main_db, "server")
    rows = results.findings_by_key(results_db, list(current))
    out = []
    for key, d in sorted(current.items(), key=lambda kv: kv[1]["decided_at"]):
        row = rows.get(key)
        if row and row["node"] == node:
            items = [g.get("item", "") for g in json.loads(row["gaps"] or "[]") if g.get("level") != "정상"]
            out.append(_pick(d, items=items))
    return out


def policy(main_db: Database, results_db: Database) -> list[dict[str, Any]]:
    """지난 정책 관리 검토의 문제에 정한 것 — kind = 문제 유형, policy_ids = 걸린 정책."""
    current = decisions.current(main_db, "policy")
    rows = results.findings_by_key(results_db, list(current))
    out = []
    for key, d in sorted(current.items(), key=lambda kv: kv[1]["decided_at"]):
        if row := rows.get(key):
            out.append(_pick(d, kind=row["kind"], policy_ids=json.loads(row["policy_ids"] or "[]")))
    return out


def events(main_db: Database, results_db: Database) -> dict[str, list[dict[str, Any]]]:
    """로그 사용자 ID → 그 사람의 로그 감시 판정에 정한 것 — at = 판정한 묶음의 마지막 로그 시각."""
    found = {int(k.split("/")[1]): d for k, d in decisions.current(main_db, "event").items() if k.startswith("event_findings/")}
    owners = results.finding_users(results_db, list(found))
    out: dict[str, list[dict[str, Any]]] = {}
    for num, d in sorted(found.items(), key=lambda kv: kv[1]["decided_at"]):
        if o := owners.get(num):
            out.setdefault(o["log_id"], []).append(_pick(d, at=o["at"]))
    return out
