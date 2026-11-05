"""데이터 종류별 소스 — 연습용 로그 · 노드 원문 · 서버 ↔ 규칙 맞추기 (DB · 모델 없이)."""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import pytest

from sentinelai.sources import (MemorySource, PolicyRule, ServerState, behavior_signals, group_by_user, load_events, load_policies,
                                rules_for, search, snapshot_changes, snapshot_from_payload, summarize, threat_lines)

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
    lines = threat_lines(events)
    assert len(lines) == 15 and all(line.endswith("]") for line in lines)
    assert lines == sorted(lines)


def test_mapper_reports_bad_rows():
    rows = [{"TimeGenerated": "2026-10-01T00:00:00Z", "Type": "DLP_CL", "WHO": "a"}, {"TimeGenerated": "어제", "Type": "DLP_CL"}]
    loaded = load_events(MemorySource(rows))
    assert [e.solution for e in loaded.records] == ["DLP"] and loaded.issues[0].line == 2
    with pytest.raises(ValueError, match="컬럼이 없습니다"):
        load_events(MemorySource([{"WHO": "a"}]))


def test_rules_for_server():
    rules = load_policies(MemorySource([
        {"policy_id": "FW-1", "source": "ANY", "destination": "10.0.1.0/24"},
        {"policy_id": "FW-2", "source": "10.0.2.5", "destination": "db-01"},
        {"policy_id": "FW-3", "source": "ANY", "destination": "ANY"},
    ])).records
    assert all(isinstance(r, PolicyRule) for r in rules)
    found = rules_for(ServerState(host="db-01", ip="10.0.1.7"), rules)
    assert [(r.policy_id, why) for r, why in found] == [("FW-1", "목적지 대역 10.0.1.0/24"), ("FW-2", "목적지 호스트 이름")]
    assert rules_for(ServerState(host="db-011", ip="10.0.9.9"), rules) == []


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
