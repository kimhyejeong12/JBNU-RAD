"""ResultStore(판정 결과) → 화면용 dict.

판정 필드(Verdict · PolicyIssue)는 그대로 두고, 화면용 값(title · detail)만 덧붙입니다.
판정에 실패한 건은 운영자가 놓치지 않도록 "주의" 로 올리고 이유 칸에 원인을 적습니다.
"""
from __future__ import annotations

from typing import Any

LEVELS = ("정상", "주의", "위험")


def _verdict(item: dict[str, Any]) -> dict[str, Any]:
    if item["failed"]:
        return {
            "level": "주의",
            "reason": f"판정 실패: {item['error']}",
            "sources": [],
            "recommendation": "모델 출력을 받지 못했습니다. 수동 검토가 필요합니다.",
        }
    return {k: item[k] for k in ("level", "reason", "sources", "recommendation")}


def permission(review: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": review["id"],
        "title": f"{review['requester']} → {review['requested_access']}",
        **_verdict(review),
        "detail": {k: v for k, v in review["raw"].items() if k != "id"},
        "elapsed_sec": review["elapsed_sec"],
        "failed": review["failed"],
    }


def finding(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item["id"],
        "title": item["subject"],
        **_verdict(item),
        "detail": {"events": item["events"], "first_event_at": item["first_event_at"], "last_event_at": item["last_event_at"]},
        "elapsed_sec": item["elapsed_sec"],
        "failed": item["failed"],
    }


def results(store: dict[str, Any]) -> dict[str, Any]:
    requests, policies, events = store["requests"], store["policies"], store["events"]
    permissions = [permission(r) for r in requests["reviews"]] if requests else []
    findings = [finding(f) for f in events["findings"]] if events else []
    if policies and policies["failed"]:
        policy_review = {"summary": f"판정 실패: {policies['error']}", "issues": [], "elapsed_sec": policies["elapsed_sec"]}
    elif policies:
        policy_review = {k: policies[k] for k in ("summary", "issues", "elapsed_sec")}
    else:
        policy_review = None
    issues = policy_review["issues"] if policy_review else []
    levels = [p["level"] for p in permissions] + [i["level"] for i in issues] + [f["level"] for f in findings]
    failed = sum(p["failed"] for p in permissions) + sum(f["failed"] for f in findings) + int(bool(policies and policies["failed"]))
    stamps = [s["generated_at"] for s in (requests, policies, events) if s]
    return {
        "generated_at": max(stamps) if stamps else None,
        "summary": {
            "total": len(levels),
            **{level: levels.count(level) for level in LEVELS},
            "permission_count": len(permissions),
            "policy_issue_count": len(issues),
            "event_count": len(findings),
            "failed": failed,
        },
        # 구역마다 마지막 실행 시각 · 읽기 실패를 따로 둡니다. 한 구역만 다시 돌릴 수 있기 때문입니다.
        "sections": {
            name: {"generated_at": s["generated_at"], "source": s["source"], "load_issues": s["load_issues"]} if s else None
            for name, s in (("requests", requests), ("policies", policies), ("events", events))
        },
        "permissions": permissions,
        "policy_review": policy_review,
        "policies": [r["raw"] for r in policies["rules"]] if policies else [],
        "events": findings,
    }
