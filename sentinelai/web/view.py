"""AI 결과 DB(정책 관리 검토 · 서버 점검 · 로그 감시 판정) → 화면용 dict.

판정 필드(Verdict · PolicyIssue)는 그대로 두고, 화면용 값(title · detail)만 덧붙입니다.
판정에 실패한 건은 운영자가 놓치지 않도록 "주의" 로 올리고 이유 칸에 원인을 적습니다.
"""
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
    }


def server(item: dict[str, Any]) -> dict[str, Any]:
    """item = db.results.latest_node_findings 의 한 건 (노드 하나의 마지막 서버 점검)."""
    title = f"{item['host']} ({item['ip']})" if item["ip"] and item["ip"] != item["host"] else item["host"]
    return {
        "id": item["node"],
        "key": item["key"],
        "title": title,
        # 서버 점검의 이유는 요약, 바꿀 것은 다른 곳마다 따로 있어 권고 칸은 비웁니다.
        **_verdict({**item, "reason": item["summary"], "recommendation": ""}),
        "detail": {"state": item["state"], "matched": item["matched"], "snapshot": item.get("snapshot") or {}},
        # 기준을 충족한다고 적은 항목(정상)은 "다른 곳"이 아니라 화면 목록에서 뺍니다. AI 결과 DB에는 모델이 낸 그대로 남습니다.
        "gaps": [g for g in item.get("gaps", []) if g.get("level") != "정상"],
        "unjudged": item.get("unjudged", []),
        "elapsed_sec": item["elapsed_sec"],
        "failed": item["failed"],
    }


def results(policies: dict[str, Any] | None, events: dict[str, Any] | None, node_findings: list[dict[str, Any]]) -> dict[str, Any]:
    """policies = db.results.latest_policy_review, events = db.results.monitor_findings (없으면 None),
    node_findings = db.results.latest_node_findings"""
    # 로그 감시는 주의 이상만 운영자 검토에 올립니다 (판정 실패도 "주의"라 빠지지 않습니다). 정상 판정은 AI 결과 DB에만 남습니다.
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
        # 구역마다 마지막 실행 시각 · 읽기 실패를 따로 둡니다. 구역마다 따로 돌기 때문입니다 (서버 점검은 노드별 주기 점검).
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
