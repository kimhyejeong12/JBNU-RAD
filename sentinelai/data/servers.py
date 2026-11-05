"""서버 ↔ 솔루션 정책 규칙 맞춰 보기 — 모델에 맡기지 않고 코드가 찾습니다."""
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
    """규칙의 한쪽이 이 서버를 가리키면 그 이유."""
    if server.ip:
        try:
            address = ipaddress.ip_address(server.ip)
        except ValueError:
            address = None
        for network in _networks(endpoint) if address else []:
            if address in network:
                return "IP" if network.num_addresses == 1 else f"대역 {network}"
    # 다른 이름의 일부로 잘못 맞지 않게 단어 경계로 찾습니다.
    if server.host and re.search(rf"(?<![\w.-]){re.escape(server.host)}(?![\w.-])", endpoint, re.IGNORECASE):
        return "호스트 이름"
    return None


def rules_for(server: ServerState, rules: list[PolicyRule]) -> list[tuple[PolicyRule, str]]:
    """ANY 는 맞춰 보지 않습니다 — 모든 서버에 붙이면 근거가 흐려집니다."""
    matched = []
    for rule in rules:
        reasons = [f"{side} {why}" for side, endpoint in (("출발지", rule.source), ("목적지", rule.destination))
                   if (why := _covers(endpoint, server))]
        if reasons:
            matched.append((rule, " · ".join(reasons)))
    return matched


def server_review_input(server: ServerState, rules: list[PolicyRule], snapshot: ServerSnapshot | None = None,
                        changes: list[str] | None = None) -> dict[str, str]:
    """subject · state(현황 + 모듈 상태 + 바뀐 설정) · matched(코드가 찾은 규칙)."""
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
