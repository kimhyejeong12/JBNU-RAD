"""서버 현황 ↔ 솔루션 정책 규칙 맞춰 보기.

어느 규칙이 이 서버를 가리키는지는 모델에 맡기지 않고 코드가 찾습니다 (IP · 대역 · 호스트 이름).
표기가 달라 코드가 못 찾는 규칙은 server_chain 의 RAG 검색이 보탭니다.
"""
from __future__ import annotations

import ipaddress
import re

from .types import PolicyRule, ServerSnapshot, ServerState

_ADDRESS = re.compile(r"\d{1,3}(?:\.\d{1,3}){3}(?:/\d{1,2})?")


def _networks(text: str) -> list[ipaddress.IPv4Network]:
    found = []
    for token in _ADDRESS.findall(text):
        try:
            found.append(ipaddress.ip_network(token, strict=False))
        except ValueError:
            continue
    return found


def _covers(endpoint: str, server: ServerState) -> str | None:
    """규칙의 출발지 · 목적지 한쪽이 이 서버를 가리키면 그 이유."""
    if server.ip:
        try:
            address = ipaddress.ip_address(server.ip)
        except ValueError:
            address = None
        for network in _networks(endpoint) if address else []:
            if address in network:
                return "IP" if network.num_addresses == 1 else f"대역 {network}"
    # 호스트 이름은 다른 이름의 일부로 잘못 맞지 않게 단어 경계로 찾습니다.
    if server.host and re.search(rf"(?<![\w.-]){re.escape(server.host)}(?![\w.-])", endpoint, re.IGNORECASE):
        return "호스트 이름"
    return None


def rules_for(server: ServerState, rules: list[PolicyRule]) -> list[tuple[PolicyRule, str]]:
    """이 서버를 출발지 · 목적지로 가리키는 규칙과 그 이유 (예: "목적지 IP", "출발지 대역 10.0.10.0/24").

    ANY 는 맞춰 보지 않습니다. 출발지 ANY 규칙은 목적지 쪽 서버에서 이미 찾고, 모든 서버에 붙이면 근거가 흐려집니다.
    """
    matched = []
    for rule in rules:
        reasons = [f"{side} {why}" for side, endpoint in (("출발지", rule.source), ("목적지", rule.destination))
                   if (why := _covers(endpoint, server))]
        if reasons:
            matched.append((rule, " · ".join(reasons)))
    return matched


def server_review_input(server: ServerState, rules: list[PolicyRule], snapshot: ServerSnapshot | None = None,
                        changes: list[str] | None = None) -> dict[str, str]:
    """server_chain 입력 — subject(서버) · state(현황 + 수집한 모듈 상태 + 직전 수집과 달라진 설정) · matched(코드가 찾은 규칙)."""
    matched = rules_for(server, rules)
    state = [server.describe()]
    if snapshot:
        state.append(snapshot.describe())
    if changes:
        state.append("- 직전 수집과 달라진 설정:\n" + "\n".join(f"  - {c}" for c in changes))
    return {
        "subject": server.name,
        "state": "\n".join(state),
        "matched": "\n".join(f"{rule.describe()} (이 서버: {why})" for rule, why in matched) or "코드가 찾은 규칙 없음",
    }
