"""서버 현황 (자산관리 내보내기) — 구조체 · 컬럼 · 읽기, 서버 ↔ 정책 규칙 맞춰 보기 (모델에 맡기지 않고 코드가 찾음)."""
from __future__ import annotations

import ipaddress
import re
from collections.abc import Sequence
from typing import Any

from .base import ColumnMapper, LoadResult, Record, Row, load
from .policies import PolicyRule


class ServerState(Record):
    """현황 파일마다 컬럼이 달라 호스트 · IP 밖의 컬럼은 attributes 에 그대로 담습니다."""

    host: str
    ip: str = ""
    attributes: dict[str, str] = {}

    @property
    def name(self) -> str:
        return f"{self.host} ({self.ip})" if self.ip and self.ip != self.host else self.host

    def describe(self) -> str:
        """한 줄에 한 항목."""
        return "\n".join([f"- 서버: {self.name}", *(f"- {k}: {v}" for k, v in self.attributes.items() if v)])


class ServerStateMapper(ColumnMapper):
    """호스트 이름과 IP 중 하나만 있어도 읽고, 나머지 컬럼은 attributes 로 보냅니다."""

    COLUMNS = {
        "host": ["host", "hostname", "server", "서버", "서버명", "호스트", "호스트명"],
        "ip": ["ip", "ip_address", "IP", "IP 주소", "IP주소"],
    }

    def check(self, columns: Sequence[str]) -> None:
        if not any(name in columns for names in self.columns.values() for name in names):
            raise ValueError(f"컬럼이 없습니다: {' / '.join(self.columns['host'] + self.columns['ip'])} 중 하나")

    def map(self, row: Row) -> ServerState:
        host, ip = self.get(row, "host"), self.get(row, "ip")
        if not host and not ip:
            raise ValueError("호스트 이름과 IP 가 모두 비어 있습니다")
        skip = self.known_columns()
        return ServerState(host=host or ip, ip=ip, attributes={k: v for k, v in row.items() if k not in skip}, raw=row)


def load_servers(target: Any, mapper: ServerStateMapper | None = None, strict: bool = False) -> LoadResult:
    return load(target, mapper or ServerStateMapper(), strict)


def inventory(servers: list[ServerState]) -> dict[str, ServerState]:
    """호스트 이름(소문자) · IP → 현황 행."""
    found = {}
    for row in servers:
        found[row.host.lower()] = row
        if row.ip:
            found[row.ip] = row
    return found


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
