"""판정마다 맥락 하나 — 대상 · 사람 · 규정 RAG · 운영자 결정을 모아 프롬프트 입력(Built)을 만듭니다."""
from __future__ import annotations

import json
from typing import Any

from langchain_core.prompts import ChatPromptTemplate

from ..db import Database, decisions, results
from ..sources import PolicyRule, SecurityEvent, ServerSnapshot, ServerState, rules_for, signals_text
from .budget import Built, Section, fit, limit
from .person import DECIDED, Person, move_text
from .regulations import Regulations

NOT_WRITTEN = "적지 않음"
NO_DECISION = "운영자 결정 없음"
POLICY_DECIDED = {"approve": "승인", "cond": "조건부 승인", "reject": "반려 확정"}
DECISION_LINES = 20


def _built(settings: Any, prompt: ChatPromptTemplate, sections: list[Section], empty: dict[str, str] | None = None) -> Built:
    return fit(sections, limit(settings, prompt), empty)


def access_text(row: dict[str, Any]) -> str:
    """분류(급여정보 등)가 조항 검색과 판정의 실마리라 권한 목록 정보를 붙입니다."""
    lines = [f"{row['requested_access']} ({row['access_code']})" if row.get("access_code") else row["requested_access"]]
    for label, key in (("시스템", "access_system"), ("분류", "access_category"), ("설명", "access_description")):
        if row.get(key):
            lines.append(f"{label}: {row[key]}")
    return "\n".join(lines)


def period_text(row: dict[str, Any]) -> str:
    start, end = row.get("period_start") or "", row.get("period_end") or ""
    return f"{start or '신청일'}부터 {end + '까지' if end else '끝을 정하지 않음'}"


def request(settings: Any, prompt: ChatPromptTemplate, regs: Regulations, row: dict[str, Any], person: Person) -> Built:
    """row = permissions.judge_input. 보유 권한은 신청할 때 남긴 것(current_access)을 씁니다."""
    requester = [f"{row.get('requester_department', '')} {row['requester_name']}".strip(), f"직무: {row.get('requester_job') or NOT_WRITTEN}"]
    if row.get("move"):
        requester.append(f"최근 이동: {move_text(row['move'])}")
    access, reason = access_text(row), (row.get("reason") or "").strip() or NOT_WRITTEN
    sections = [
        Section("requester", requester), Section("requested_access", [access]), Section("reason", [reason]),
        Section("period", [period_text(row)]), Section("current_access", [row.get("current_access") or "없음"]),
        *person.full(held=False),
        Section("context", [regs.clauses(f"{requester[0]} / {access} / {reason}")]),
    ]
    return _built(settings, prompt, sections)


def grant(settings: Any, prompt: ChatPromptTemplate, regs: Regulations, row: dict[str, Any], person: Person) -> Built:
    """row = permissions.grant_input (신청 행 + move)."""
    move = row["move"]
    requester = f"{move['to_department']} {row['requester_name']}".strip()
    access = access_text(row)
    sections = [
        Section("requester", [requester, f"직무: {move['to_job'] or NOT_WRITTEN}"]), Section("move", [move_text(move)]),
        Section("requested_access", [access]), Section("reason", [(row.get("reason") or "").strip() or NOT_WRITTEN]),
        Section("period", [period_text(row)]),
        *person.full(),
        Section("context", [regs.clauses(f"{requester} / {access} / {move_text(move)}")]),
    ]
    return _built(settings, prompt, sections)


def events(settings: Any, prompt: ChatPromptTemplate, regs: Regulations, group: list[SecurityEvent], person: Person,
           fast: bool = False) -> Built:
    """빠른 감시는 수 초 안에 끝나야 해서 사람 맥락을 계정 · 지금 가진 권한만 넣습니다."""
    first = group[0]
    subject = f"{first.department} {first.who or first.user_name}".strip()
    lines = [e.describe() for e in group]
    query = f"{subject} / " + "\n".join(lines)
    sections = [
        Section("subject", [subject]), Section("events", lines, trim=1),
        *(person.short() if fast else person.full(skip=group)),
        Section("context", [regs.clauses(query)]), Section("rules", [regs.rules(query)]),
    ]
    return _built(settings, prompt, sections)


def suspect(settings: Any, prompt: ChatPromptTemplate, regs: Regulations, info: dict[str, Any], person: Person) -> Built:
    """info = People.suspects 의 한 줄. 계정 미연결은 운영 설정일 뿐이라 모델이 의심 근거로 삼지 않게 적습니다."""
    who = f"{info['department']} {info['name']}".strip()
    account = info["login_id"] or "SentinelAI 계정과 아직 잇지 않음 — 의심 근거 아님"
    log_id = info["log_id"] or "로그 사용자 ID 를 아직 적지 않음 — 의심 근거 아님"
    signals = info["signals"]
    query = " / ".join([who, *(signals or {}).get("highlights", []), ", ".join((signals or {}).get("sensitive_words", []))])
    sections = [
        Section("subject", [f"{who} (계정: {account} / 로그 사용자 ID: {log_id})"]),
        Section("signals", [signals_text(signals)]),
        *person.full(signals=False),
        Section("context", [regs.clauses(query)]),
    ]
    return _built(settings, prompt, sections)


def server_decisions(main_db: Database, results_db: Database, node: str) -> list[str]:
    """이 노드의 지난 서버 점검에 운영자가 정한 것 (오래된 것부터)."""
    current = decisions.current(main_db, "server")
    rows = results.findings_by_key(results_db, list(current))
    out = []
    for key, d in sorted(current.items(), key=lambda kv: kv[1]["decided_at"]):
        row = rows.get(key)
        if not row or row["node"] != node or d["action"] not in DECIDED:
            continue
        items = [g.get("item", "") for g in json.loads(row["gaps"] or "[]") if g.get("level") != "정상"]
        out.append(f"- {d['decided_at'][:16].replace('T', ' ')} UTC {d['decider_name']}이(가) {DECIDED[d['action']]}로 정함"
                   + (f" — 그때 정책과 다른 곳: {', '.join(items)}" if items else "") + (f" · 의견: {d['comment'][:100]}" if d["comment"] else ""))
    return out[-DECISION_LINES:]


def server(settings: Any, prompt: ChatPromptTemplate, regs: Regulations, state: ServerState, snapshot: ServerSnapshot,
           changes: list[str], rules: list[PolicyRule], decided: list[str]) -> Built:
    """코드가 IP · 대역 · 호스트 이름으로 맞춘 규칙에 검색으로 찾은 규칙을 보탭니다."""
    matched = rules_for(state, rules)
    lines = [state.describe(), snapshot.describe()]
    if changes:
        lines.append("- 직전 수집과 달라진 설정:\n" + "\n".join(f"  - {c}" for c in changes))
    query = f"{state.name} / " + "\n".join(lines)
    sections = [
        Section("subject", [state.name]), Section("state", lines),
        Section("matched", [f"{rule.describe()} (이 서버: {why})" for rule, why in matched]),
        Section("rules", [regs.rules(query)]), Section("context", [regs.clauses(query)]),
        Section("decisions", decided, trim=0),
    ]
    return _built(settings, prompt, sections, {"matched": "코드가 찾은 규칙 없음", "decisions": NO_DECISION})


def policy_decisions(main_db: Database, results_db: Database) -> list[str]:
    """지난 정책 관리 검토의 문제에 운영자가 정한 것 (오래된 것부터)."""
    current = decisions.current(main_db, "policy")
    rows = results.findings_by_key(results_db, list(current))
    out = []
    for key, d in sorted(current.items(), key=lambda kv: kv[1]["decided_at"]):
        row = rows.get(key)
        if not row or d["action"] not in POLICY_DECIDED:
            continue
        ids = ", ".join(json.loads(row["policy_ids"] or "[]"))
        out.append(f"- {d['decided_at'][:10]} {d['decider_name']}: {row['kind']} ({ids}) — {POLICY_DECIDED[d['action']]}"
                   + (f" · 의견: {d['comment'][:100]}" if d["comment"] else ""))
    return out[-DECISION_LINES:]


def policy(settings: Any, prompt: ChatPromptTemplate, regs: Regulations, rules: list[PolicyRule], decided: list[str]) -> Built:
    text = PolicyRule.format(rules)
    sections = [Section("policies", [text]), Section("context", [regs.clauses(text)]), Section("decisions", decided, trim=0)]
    return _built(settings, prompt, sections, {"decisions": NO_DECISION})


__all__ = ["access_text", "events", "grant", "period_text", "policy", "policy_decisions", "request", "server",
           "server_decisions", "suspect"]
