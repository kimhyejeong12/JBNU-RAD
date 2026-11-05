"""데이터 계층 — 연습용 로그 · 노드 원문 · 규정 RAG 검색어 (DB · 모델 없이)."""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import pytest

from sentinelai.sources import (Regulations, behavior_signals, group_by_user, load_events, search, server_lines,
                                snapshot_changes, snapshot_from_payload, summarize, threat_lines)

# 근무 시간 밖은 서버 현지 시각(KST)으로 셉니다.
os.environ["TZ"] = "Asia/Seoul"
time.tzset()

LOG = "data/연습용_로그_원본+합성.csv"
NOW = datetime(2026, 10, 21, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def events():
    return load_events(LOG).records


def test_practice_log(events):
    assert len(events) == 157
    assert {k: len(v) for k, v in group_by_user(events).items()} == {"5": 48, "0": 27, "1": 20, "4": 22, "3": 25, "2": 13, "9": 2}
    assert summarize(events)["attribute_totals"] == {"PrintCount": 2260, "Exception": 43}
    assert len(search(events, keyword="Exception=1")) == 43


def test_signals_and_threat_lines(events):
    signals = behavior_signals(events, NOW)
    assert signals["9"]["new_account"] and signals["9"]["recent_events"] == 2
    assert signals["5"]["volume_ratio"] == 5.7 and signals["5"]["max_burst_30min"] == 12
    assert signals["4"]["sensitive_words"] == ["개인정보", "계약", "고객"]
    lines = threat_lines(events, 15)
    assert len(lines) == 15 and all(line.endswith("]") for line in lines)
    assert lines == sorted(lines)


def test_mapper_reports_bad_rows():
    rows = [{"TimeGenerated": "2026-10-01T00:00:00Z", "Type": "DLP_CL", "WHO": "a"}, {"TimeGenerated": "어제", "Type": "DLP_CL"}]
    loaded = load_events(rows)
    assert [e.solution for e in loaded.records] == ["DLP"] and loaded.issues[0].line == 2
    with pytest.raises(ValueError, match="컬럼이 없습니다"):
        load_events([{"WHO": "a"}])


class FakeDocuments:
    """search 에 들어온 검색어를 남기고, chunks 는 쌓인 순서대로 돌려줍니다."""

    def __init__(self, chunks: list[str]) -> None:
        self.queries: list[str] = []
        self.stored = chunks

    def search(self, query: str, k: int | None = None) -> list[str]:
        self.queries.append(query)
        return self.stored[:1]

    def chunks(self) -> list[str]:
        return self.stored

    @staticmethod
    def format(docs: list[str]) -> str:
        return "\n\n".join(docs)


def test_regulations_search_clauses_only_and_read_everything():
    docs = FakeDocuments(["[정책_운영기준.md] 6.1 DLP 우선", "[정책_운영기준.md] 6.2 PAM"])
    regs = Regulations(docs)
    snap = snapshot_from_payload({"format": "sentinel-node 1", "host": "web-01", "ip": "10.0.0.5", "collected_at": "2026-11-05T00:00:00Z",
                                  "sections": {}}, "web")
    assert server_lines(snap, ["UFW 꺼짐"])[0] == "- 서버: web-01 (10.0.0.5)"
    assert regs.for_server(snap, ["UFW 꺼짐"]) == "[정책_운영기준.md] 6.1 DLP 우선"
    assert docs.queries[0].startswith("web-01 (10.0.0.5) / - 서버: web-01") and "UFW 꺼짐" in docs.queries[0]
    assert regs.everything() == "[정책_운영기준.md] 6.1 DLP 우선\n\n[정책_운영기준.md] 6.2 PAM"
    assert Regulations(FakeDocuments([])).everything() == "RAG 에 올라간 기준 문서 없음"
    assert Regulations(FakeDocuments([])).clauses("x") == "찾은 기준 조항 없음"


def _payload(ufw: str, sshd: str = "permitrootlogin no\npasswordauthentication no") -> dict:
    return {"format": "sentinel-node 1", "node": "web-01", "host": "web-01", "ip": "10.0.0.5", "collected_at": "2026-10-20T01:00:00Z",
            "sections": {"ufw": ufw, "sshd": sshd, "accounts": "==> uid0 <==\nroot\n==> groups <==\nsudo:x:27:ops"}}


def test_snapshot_parse_and_changes():
    on = snapshot_from_payload(_payload("Status: active\nDefault: deny (incoming), allow (outgoing)\n\nTo  Action  From\n--  ------  ----\n"
                                        "22/tcp                     ALLOW IN    Anywhere"))
    assert on.modules["ufw"]["상태"] == "켜짐" and on.modules["ufw"]["어디서나 허용"] == "22/tcp"
    assert on.modules["sshd"] == {"permitrootlogin": "no", "passwordauthentication": "no"}
    assert on.modules["accounts"]["관리자 그룹"] == "sudo: ops"
    off = snapshot_from_payload(_payload("Status: inactive"))
    assert "[UFW] 상태: 켜짐 → 꺼짐" in snapshot_changes(on.modules, off.modules)
    assert snapshot_changes(None, off.modules) == []
    with pytest.raises(ValueError):
        snapshot_from_payload({"format": "x"})
