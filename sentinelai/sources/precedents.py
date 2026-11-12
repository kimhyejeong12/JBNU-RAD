"""선례 — 판정과 비슷한 지난 사례에 사람(보안 운영자 · 보안 총책임자)이 정한 것. 예전 AI 등급은 고르지 않습니다 (되먹임 방지)."""
from __future__ import annotations

import json
from typing import Any

from ..db import Database, decisions, permissions, results
from .logs import SecurityEvent

K = 6  # 판정 한 건에 넣는 선례 수 상한입니다.
EVENT_LINES = 3  # 로그 감시 선례마다 옮기는 로그 줄 수입니다.


def _top(scored: list[tuple[int, dict[str, Any]]]) -> list[dict[str, Any]]:
    """비슷한 정도가 0 인 것은 빼고 높은 순 — 같으면 들어온 순서(최근 것부터)를 지킵니다."""
    return [d for _, d in sorted((x for x in scored if x[0] > 0), key=lambda x: -x[0])[:K]]


def _request_decision(r: dict[str, Any]) -> tuple[str, str]:
    if r["stage"] == "revoked":
        return "승인 뒤 회수", r["revoke_reason"] or ""
    if r["stage"] == "approved":
        return "최종 승인", r["top_comment"] or r["manager_comment"] or ""
    if r["top_action"] == "reject":
        return "최종 반려", r["top_comment"] or ""
    return "1차 반려", r["manager_comment"] or ""


def _words(items: list[str]) -> set[str]:
    return {i.strip().casefold() for i in items if i and i.strip()}


class Precedents:
    def __init__(self, main_db: Database, results_db: Database) -> None:
        self.main_db = main_db
        self.results_db = results_db

    def _requests(self, row: dict[str, Any], department: str) -> list[dict[str, Any]]:
        """같은 권한 3 · 같은 분류 2 · 같은 시스템 1, 같은 부서면 1 을 더합니다."""
        code, category, system = row.get("access_code"), row.get("access_category"), row.get("access_system")
        scored = []
        for r in permissions.decided_requests(self.main_db, row.get("request_no") or ""):
            score = 3 * bool(code and r["access_code"] == code) + 2 * bool(category and r["category"] == category) \
                + bool(system and r["system"] == system)
            if score:
                score += bool(department and r["requester_department"] == department)
            decision, comment = _request_decision(r)
            scored.append((score, {"kind": "request", "department": r["requester_department"], "job": r["requester_job"],
                                   "access": r["requested_access"], "code": r["access_code"], "category": r["category"] or "",
                                   "reason": r["reason"], "period_end": r["period_end"], "decision": decision, "comment": comment}))
        return _top(scored)

    def for_request(self, row: dict[str, Any]) -> list[dict[str, Any]]:
        return self._requests(row, row.get("requester_department") or "")

    def for_grant(self, row: dict[str, Any]) -> list[dict[str, Any]]:
        """옮긴 뒤 부서로 견줍니다."""
        return self._requests(row, (row.get("move") or {}).get("to_department") or "")

    def for_events(self, group: list[SecurityEvent], user: str) -> list[dict[str, Any]]:
        """다른 사람의 로그 감시 판정에 정한 것 — 솔루션 · 어디서 · 행위 · 예외 승인이 겹칠수록 앞에 둡니다."""
        current = {k: d for k, d in decisions.current(self.main_db, "event").items() if k.startswith("event_findings/")}
        rows = results.findings_by_key(self.results_db, list(current))
        marks = _words([x for e in group for x in (e.solution, e.where, e.how)])
        if any(e.attributes.get("Exception") == "1" for e in group):
            marks.add("exception=1")
        scored = []
        for key, d in sorted(current.items(), key=lambda kv: kv[1]["decided_at"], reverse=True):
            row = rows.get(key)
            if not row or row["user"] == user or d["action"] not in ("act", "clear"):
                continue
            text = (row["events"] or "").casefold()
            scored.append((sum(m in text for m in marks), {"kind": "event", "subject": row["subject"],
                                                           "events": (row["events"] or "").split("\n")[:EVENT_LINES],
                                                           "decision": d["action"], "comment": d["comment"]}))
        return _top(scored)

    def for_server(self, node: str, items: list[str]) -> list[dict[str, Any]]:
        """다른 노드의 서버 점검에 정한 것 — 1차 판정이 낸 차이 항목과 겹치는 것만."""
        wanted = _words(items)
        current = {k: d for k, d in decisions.current(self.main_db, "server").items() if d["action"] in ("act", "clear")}
        rows = results.findings_by_key(self.results_db, list(current))
        scored = []
        for key, d in sorted(current.items(), key=lambda kv: kv[1]["decided_at"], reverse=True):
            row = rows.get(key)
            if not row or row["node"] == node:
                continue
            gaps = [g.get("item", "") for g in json.loads(row["gaps"] or "[]") if g.get("level") != "정상"]
            scored.append((len(wanted & _words(gaps)), {"kind": "server", "node": row["node"], "items": gaps,
                                                        "decision": d["action"], "comment": d["comment"]}))
        return _top(scored)

    def for_policy(self, issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """지난 정책 관리 검토의 문제에 정한 것 — 1차 판정의 문제와 조항 · 유형이 겹치는 것만."""
        ids = _words([p for i in issues for p in i.get("policy_ids") or []])
        kinds = {i.get("kind") for i in issues}
        current = {k: d for k, d in decisions.current(self.main_db, "policy").items() if d["action"] in ("approve", "cond", "reject")}
        rows = results.findings_by_key(self.results_db, list(current))
        scored = []
        for key, d in sorted(current.items(), key=lambda kv: kv[1]["decided_at"], reverse=True):
            if not (row := rows.get(key)):
                continue
            policy_ids = json.loads(row["policy_ids"] or "[]")
            score = 2 * len(ids & _words(policy_ids))
            scored.append((score + (row["kind"] in kinds) if score else 0,
                           {"kind": "policy", "issue": row["kind"], "policy_ids": policy_ids, "reason": row["reason"],
                            "decision": d["action"], "comment": d["comment"]}))
        return _top(scored)


__all__ = ["K", "Precedents"]
