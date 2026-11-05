"""판정마다 빌더 하나 — 데이터 계층이 모은 대상 · 사람 · 규정 RAG 결과 · 운영자 결정을 칸(Section)으로 씁니다. 크기는 budget 이 맞춥니다."""
from __future__ import annotations

from typing import Any

from ..sources import (NOT_WRITTEN, Person, SecurityEvent, ServerSnapshot, access_text, group_subject, move_text, reason_text,
                       requester_text, server_lines, signals_text)
from . import person as about
from .budget import COMMENT_CHARS, DECISION_LINES, Section
from .person import DECIDED

NO_DECISION = "운영자 결정 없음"
POLICY_DECIDED = {"approve": "승인", "cond": "조건부 승인", "reject": "반려 확정"}


def period_text(row: dict[str, Any]) -> str:
    start, end = row.get("period_start") or "", row.get("period_end") or ""
    return f"{start or '신청일'}부터 {end + '까지' if end else '끝을 정하지 않음'}"


def request(row: dict[str, Any], person: Person, clauses: str) -> list[Section]:
    """row = permissions.judge_input. 보유 권한은 신청할 때 남긴 것(current_access)을 씁니다."""
    requester = [requester_text(row), f"직무: {row.get('requester_job') or NOT_WRITTEN}"]
    if row.get("move"):
        requester.append(f"최근 이동: {move_text(row['move'])}")
    return [
        Section("requester", requester), Section("requested_access", [access_text(row)]), Section("reason", [reason_text(row)]),
        Section("period", [period_text(row)]), Section("current_access", [row.get("current_access") or "없음"]),
        *about.full(person, held=False),
        Section("context", [clauses]),
    ]


def grant(row: dict[str, Any], person: Person, clauses: str) -> list[Section]:
    """row = permissions.grant_input (신청 행 + move)."""
    move = row["move"]
    return [
        Section("requester", [requester_text(row, move["to_department"]), f"직무: {move['to_job'] or NOT_WRITTEN}"]),
        Section("move", [move_text(move)]),
        Section("requested_access", [access_text(row)]), Section("reason", [reason_text(row)]),
        Section("period", [period_text(row)]),
        *about.full(person),
        Section("context", [clauses]),
    ]


def events(group: list[SecurityEvent], person: Person, clauses: str, fast: bool = False) -> list[Section]:
    """빠른 감시는 수 초 안에 끝나야 해서 사람 맥락을 계정 · 지금 가진 권한만 넣습니다."""
    return [
        Section("subject", [group_subject(group)]), Section("events", [e.describe() for e in group], cut="events"),
        *(about.short(person) if fast else about.full(person, skip=group)),
        Section("context", [clauses]),
    ]


def suspect(info: dict[str, Any], person: Person, clauses: str) -> list[Section]:
    """info = People.suspects 의 한 줄. 계정 미연결은 운영 설정일 뿐이라 모델이 의심 근거로 삼지 않게 적습니다."""
    who = f"{info['department']} {info['name']}".strip()
    account = info["login_id"] or "SentinelAI 계정과 아직 잇지 않음 — 의심 근거 아님"
    log_id = info["log_id"] or "로그 사용자 ID 를 아직 적지 않음 — 의심 근거 아님"
    return [
        Section("subject", [f"{who} (계정: {account} / 로그 사용자 ID: {log_id})"]),
        Section("signals", [signals_text(info["signals"])]),
        *about.full(person, signals=False),
        Section("context", [clauses]),
    ]


def _comment(d: dict[str, Any]) -> str:
    return f" · 의견: {d['comment'][:COMMENT_CHARS]}" if d["comment"] else ""


def server_decision_lines(decided: list[dict[str, Any]]) -> list[str]:
    """decided = sources.decisions.server."""
    out = [f"- {d['decided_at'][:16].replace('T', ' ')} UTC {d['decider_name']}이(가) {DECIDED[d['action']]}로 정함"
           + (f" — 그때 정책과 다른 곳: {', '.join(d['items'])}" if d["items"] else "") + _comment(d)
           for d in decided if d["action"] in DECIDED]
    return out[-DECISION_LINES:]


def server(snapshot: ServerSnapshot, changed: list[str], clauses: str, decided: list[dict[str, Any]]) -> list[Section]:
    return [
        Section("subject", [snapshot.name]), Section("state", server_lines(snapshot, changed)), Section("context", [clauses]),
        Section("decisions", server_decision_lines(decided), cut="decisions", empty=NO_DECISION),
    ]


def policy_decision_lines(decided: list[dict[str, Any]]) -> list[str]:
    """decided = sources.decisions.policy."""
    out = [f"- {d['decided_at'][:10]} {d['decider_name']}: {d['kind']} ({', '.join(d['policy_ids'])}) — {POLICY_DECIDED[d['action']]}"
           + _comment(d) for d in decided if d["action"] in POLICY_DECIDED]
    return out[-DECISION_LINES:]


def policy(documents: str, decided: list[dict[str, Any]]) -> list[Section]:
    """documents = RAG 에 쌓인 기준 문서 전체."""
    return [Section("documents", [documents]), Section("decisions", policy_decision_lines(decided), cut="decisions", empty=NO_DECISION)]


__all__ = ["events", "grant", "period_text", "policy", "policy_decision_lines", "request", "server", "server_decision_lines", "suspect"]
