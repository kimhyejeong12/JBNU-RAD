"""사용자 신뢰 수치 — 로그 감시 판정과 권한 신청 기록을 사람별로 모아 100점에서 깎습니다.

모델을 쓰지 않는 규칙 점수라 같은 기록이면 늘 같은 값이고, 감점마다 근거 기록을 남겨 화면이 그대로 보여줍니다.
사람은 계정(권한 신청)과 로그 사용자 ID(로그 감시)를 계정의 log_id 로 잇습니다. 잇지 못한 로그 사용자는 "계정 미연결"로 따로 둡니다.
점수는 결재 · 조치를 정하는 근거가 아니라 먼저 살펴볼 사람을 고르는 참고값입니다. 감점 값의 이유는 NOTES.md 에 있습니다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

FULL = 100
# 감점 — 로그 감시 판정 · 권한 신청 결과마다. 판정 실패는 화면과 같이 주의로 셉니다.
LOG_POINTS = {"위험": 15, "주의": 5}
REPEAT_POINTS = 5          # 기간 안 두 번째부터의 주의 · 위험 판정마다 더 깎습니다
REQUEST_AI_POINTS = {"위험": 8, "주의": 3}
REJECTED_POINTS = 5
REVOKED_POINTS = 10
# 오래된 기록일수록 덜 깎습니다 (지금부터 30일 안 1배, 90일 안 0.5배, 그 전 0.25배).
RECENCY = ((30, 1.0), (90, 0.5))
OLD = 0.25
BANDS = ((90, "높음"), (70, "보통"))


def _weight(at: str, now: datetime) -> float:
    days = (now - datetime.fromisoformat(at)).total_seconds() / 86400
    return next((w for limit, w in RECENCY if days <= limit), OLD)


def band(score: int) -> str:
    return next((name for floor, name in BANDS if score >= floor), "낮음")


def trust_scores(accounts: list[dict[str, Any]], findings: list[dict[str, Any]], requests: list[dict[str, Any]],
                 now: datetime | None = None) -> list[dict[str, Any]]:
    """사람별 신뢰 수치, 낮은 순.

    accounts = db.auth.accounts_brief, findings = db.results.user_findings, requests = db.permissions.user_requests.
    → [{key, name, department, login_id, log_id, linked, log_subject, score, band, deductions[{what, points, at, ref}], counts}]
    """
    now = now or datetime.now(timezone.utc)
    people: dict[str, dict[str, Any]] = {}
    by_log: dict[str, str] = {}
    by_account: dict[int, str] = {}

    def person(key: str, **info: Any) -> dict[str, Any]:
        return people.setdefault(key, {"key": key, **info, "log_subject": "", "deductions": [],
                                       "counts": {"로그 위험": 0, "로그 주의": 0, "로그 정상": 0, "신청": 0, "신청 위험": 0, "반려": 0, "회수": 0}})

    # 신청할 수 있는 일반 사용자와 로그 사용자 ID 를 적은 계정만 사람으로 둡니다 (나머지 운영 계정은 기록이 없습니다).
    for a in accounts:
        if a["role"] != "user" and not a["log_id"]:
            continue
        key = f"account:{a['id']}"
        person(key, name=a["display_name"], department=a["department"], login_id=a["login_id"], log_id=a["log_id"], linked=bool(a["log_id"]))
        by_account[a["id"]] = key
        if a["log_id"]:
            by_log[a["log_id"]] = key

    def deduct(p: dict[str, Any], what: str, raw: float, at: str, ref: str) -> None:
        w = _weight(at, now)
        p["deductions"].append({"what": what, "points": round(raw * w, 1), "raw": raw, "weight": w, "at": at, "ref": ref})

    flagged: dict[str, int] = {}
    for f in findings:
        key = by_log.get(f["log_id"]) or f"log:{f['log_id']}"
        p = person(key, name=f["subject"], department="", login_id=None, log_id=f["log_id"], linked=False)
        p["log_subject"] = f["subject"]  # 로그 조회는 로그의 "부서 이름" 표기로 거릅니다
        p["counts"][f"로그 {f['level']}"] += 1
        if f["level"] == "정상":
            continue
        n = flagged[key] = flagged.get(key, 0) + 1
        label = "판정 실패(주의로 셈)" if f["failed"] else f["level"]
        deduct(p, f"로그 감시 {label} — 로그 {f['lines']}줄", LOG_POINTS[f["level"]], f["at"], f["key"])
        if n > 1:
            deduct(p, f"로그 감시 반복 ({n}번째 주의 · 위험)", REPEAT_POINTS, f["at"], f["key"])

    for r in requests:
        key = by_account.get(r["account_id"])
        if key is None:
            continue
        p = people[key]
        p["counts"]["신청"] += 1
        if r["ai"] in REQUEST_AI_POINTS:
            p["counts"]["신청 위험"] += r["ai"] == "위험"
            deduct(p, f"권한 신청 AI {r['ai']} — {r['access']}", REQUEST_AI_POINTS[r["ai"]], r["at"], r["request_no"])
        if r["rejected_by"]:
            p["counts"]["반려"] += 1
            deduct(p, f"권한 신청 {r['rejected_by']} 반려 — {r['access']}", REJECTED_POINTS, r["at"], r["request_no"])
        if r["stage"] == "revoked":
            p["counts"]["회수"] += 1
            deduct(p, f"권한 회수 — {r['access']} ({r['revoke_reason'] or '사유 없음'})", REVOKED_POINTS, r["at"], r["request_no"])

    for p in people.values():
        p["score"] = max(0, round(FULL - sum(d["points"] for d in p["deductions"])))
        p["band"] = band(p["score"])
        p["deductions"].sort(key=lambda d: d["at"], reverse=True)
    return sorted(people.values(), key=lambda p: (p["score"], p["name"]))
