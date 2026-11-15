"""AI 결과 DB → 화면용 dict. 판정 필드는 그대로 두고 title · detail 만 덧붙입니다."""
from __future__ import annotations

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
        "detail": {"snapshot": item.get("snapshot") or {}},
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
            for name, s in (("policies", policies and {"generated_at": policies["generated_at"], "source": "기준 문서", "load_issues": []}),
                            ("events", events),
                            ("servers", nodes_at and {"generated_at": nodes_at, "source": "수집 노드", "load_issues": []}))
        },
        "policy_review": policy_review,
        "servers": servers,
        "events": findings,
    }
