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


# --- 운영자 결정 이어받기 ---
# 다시 판정해도 지문이 같으면 같은 문제를 다시 결정하지 않게 지난 결정을 잇습니다 (로그 감시는 판정마다 새 로그라 잇지 않음).

def server_signature(node: str, level: str | None, gaps: list[dict[str, Any]]) -> tuple:
    return ("server", node, level, tuple(sorted((g.get("item", ""), g.get("level", "")) for g in gaps if g.get("level") != "정상")))


def policy_signature(kind: str, level: str | None, policy_ids: list[str]) -> tuple:
    return ("policy", kind, level, tuple(sorted(policy_ids)))


def row_signature(key: str, row: dict[str, Any]) -> tuple | None:
    """지난 판정 행 → 비교용 지문입니다."""
    if key.startswith("node_findings/"):
        return server_signature(row["node"], row["level"], json.loads(row["gaps"]))
    if key.startswith("policy_issues/"):
        return policy_signature(row["kind"], row["level"], json.loads(row["policy_ids"]))
    return None


def carry(current: list[tuple[str, tuple]], decided: dict[str, dict], signatures: dict[str, tuple], touched: set[str]) -> dict[str, dict]:
    """key → 이어받은 결정(+carried_from). 자기 기록이 있는 key(touched)는 취소가 먹히게 잇지 않습니다."""
    latest: dict[tuple, tuple[str, dict]] = {}
    for key, decision in decided.items():
        sig = signatures.get(key)
        if sig is not None and (sig not in latest or decision["id"] > latest[sig][1]["id"]):
            latest[sig] = (key, decision)
    out: dict[str, dict] = {}
    for key, sig in current:
        if key in touched or sig not in latest:
            continue
        source, decision = latest[sig]
        out[key] = {**decision, "item_key": key, "carried_from": source}
    return out


def carried(results_db: Database, current: dict[str, list[tuple[str, tuple]]],
            decided: dict[str, dict[str, dict]], log: dict[str, dict[str, list[dict]]]) -> dict[str, dict[str, dict]]:
    """current = kind → [(지금 판정 key, 지문)], decided = kind → 지금 결정 → kind → 이어받은 결정입니다."""
    rows = results.findings_by_key(results_db, [k for kind in current for k in decided.get(kind, {})])
    signatures = {k: sig for k, row in rows.items() if (sig := row_signature(k, row)) is not None}
    return {kind: carry(items, decided.get(kind, {}), signatures, set(log.get(kind, {}))) for kind, items in current.items()}
