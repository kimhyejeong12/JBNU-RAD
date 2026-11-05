"""AI 결과 DB → 화면용 dict. 판정 필드는 그대로 두고 title · detail 만 덧붙입니다."""
from __future__ import annotations

import json

from typing import Any

LEVELS = ("정상", "주의", "위험")
REVIEW_LEVELS = ("주의", "위험")


def _verdict(item: dict[str, Any]) -> dict[str, Any]:
    if item["failed"]:
        return {
            "level": "주의",
            "reason": f"판정 실패: {item['error']}",
            "sources": [],
            "recommendation": "모델 출력을 받지 못했습니다. 수동 검토가 필요합니다.",
        }
    return {k: item[k] for k in ("level", "reason", "sources", "recommendation")}


def finding(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "key": item["key"],
        "title": item["subject"],
        **_verdict(item),
        "detail": {"events": item["events"], "first_event_at": item["first_event_at"], "last_event_at": item["last_event_at"]},
        "elapsed_sec": item["elapsed_sec"],
        "failed": item["failed"],
        # fast = 빠른 감시의 1차 판정입니다.
        "stage": item.get("stage", "final"),
    }


def server(item: dict[str, Any]) -> dict[str, Any]:
    title = f"{item['host']} ({item['ip']})" if item["ip"] and item["ip"] != item["host"] else item["host"]
    return {
        "id": item["node"],
        "key": item["key"],
        "title": title,
        # 바꿀 것은 다른 곳마다 따로 있어 권고 칸은 비웁니다.
        **_verdict({**item, "reason": item["summary"], "recommendation": ""}),
        "detail": {"state": item["state"], "matched": item["matched"], "snapshot": item.get("snapshot") or {}},
        # 모델이 정상이라 적은 항목은 "다른 곳"이 아니라 화면에서만 뺍니다.
        "gaps": [g for g in item.get("gaps", []) if g.get("level") != "정상"],
        "unjudged": item.get("unjudged", []),
        "elapsed_sec": item["elapsed_sec"],
        "failed": item["failed"],
    }


def results(policies: dict[str, Any] | None, events: dict[str, Any] | None, node_findings: list[dict[str, Any]]) -> dict[str, Any]:
    # 로그 감시는 주의 이상만 올립니다 (판정 실패도 "주의"라 빠지지 않음).
    findings = [f for f in (finding(f) for f in events["findings"]) if f["level"] in REVIEW_LEVELS] if events else []
    servers = [server(f) for f in node_findings]
    if policies and policies["failed"]:
        policy_review = {"summary": f"판정 실패: {policies['error']}", "issues": [], "elapsed_sec": policies["elapsed_sec"]}
    elif policies:
        policy_review = {k: policies[k] for k in ("summary", "issues", "elapsed_sec")}
    else:
        policy_review = None
    issues = policy_review["issues"] if policy_review else []
    levels = [i["level"] for i in issues] + [s["level"] for s in servers] + [f["level"] for f in findings]
    failed = sum(f["failed"] for f in findings) + sum(s["failed"] for s in servers) + int(bool(policies and policies["failed"]))
    nodes_at = max((f["created_at"] for f in node_findings), default=None)
    stamps = [s["generated_at"] for s in (policies, events) if s] + ([nodes_at] if nodes_at else [])
    return {
        "generated_at": max(stamps) if stamps else None,
        "summary": {
            "total": len(levels),
            **{level: levels.count(level) for level in LEVELS},
            "policy_issue_count": len(issues),
            "server_count": len(servers),
            "event_count": len(findings),
            "failed": failed,
        },
        # 구역마다 따로 돌아 마지막 실행 시각 · 읽기 실패를 따로 둡니다.
        "sections": {
            name: {"generated_at": s["generated_at"], "source": s["source"], "load_issues": s["load_issues"]} if s else None
            for name, s in (("policies", policies), ("events", events),
                            ("servers", nodes_at and {"generated_at": nodes_at, "source": "수집 노드", "load_issues": []}))
        },
        "policy_review": policy_review,
        "policies": [r["raw"] for r in policies["rules"]] if policies else [],
        "servers": servers,
        "events": findings,
    }


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


def carry_decisions(current: list[tuple[str, tuple]], decided: dict[str, dict], signatures: dict[str, tuple], touched: set[str]) -> dict[str, dict]:
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
