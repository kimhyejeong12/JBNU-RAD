"""AI 결과 DB — 정책 관리 검토 · 로그 감시 · 수집 · 노드 점검 · 의심 점수 · 질의 기록이 쌓이고 그대로 읽히는지 봅니다."""
from __future__ import annotations

import pytest

from sentinelai.db import Denied, results

GAP = {"source": "6.2 PAM", "level": "위험", "item": "[SSH] root 로그인", "current": "yes"}


def test_policy_review(results_db):
    rid = results.save_policy_review(results_db, {
        "source": "data/policies", "load_issues": [], "rules": [{"id": "FW-001"}], "summary": "충돌 1건", "failed": False,
        "elapsed_sec": 12.5,
        "issues": [{"kind": "충돌", "level": "위험", "policy_ids": ["SWG-001", "DLP-001"], "reason": "업로드", "recommendation": "차단"}],
        "servers": {"source": "data/servers", "load_issues": [], "findings": [
            {"host": "web-01", "ip": "10.0.0.5", "level": "위험", "summary": "root 로그인", "gaps": [GAP], "failed": False}]},
    }, "qwen3:14b")
    review = results.latest_policy_review(results_db)
    assert review["id"] == rid and review["elapsed_sec"] == 12.5
    assert review["issues"][0]["policy_ids"] == ["SWG-001", "DLP-001"]
    assert review["servers"]["findings"][0]["sources"] == ["6.2 PAM"]
    key = review["issues"][0]["key"]
    assert results.findings_by_key(results_db, [key, "policy_issues/x", "other/1"])[key]["kind"] == "충돌"
    with pytest.raises(Denied, match="AI 결과는 고칠 수 없습니다"), results_db.transaction() as conn:
        conn.execute("UPDATE policy_issues SET level = '정상'")


def test_monitor_runs(results_db):
    events = "- 2026-11-01 10:00:00 UTC 로그인 실패\n- 2026-11-02 11:00:00 UTC 대량 다운로드"
    finding = {"user": "kim.hj", "subject": "인사팀 김혜정", "first_event_at": "2026-11-01T10:00:00+00:00",
               "last_event_at": "2026-11-02T11:00:00+00:00", "events": events, "level": "위험", "reason": "대량 다운로드",
               "failed": False}
    results.save_monitor_run(results_db, {"source": "events.csv", "last_event_at": "2026-11-02T11:00:00+00:00", "findings": [finding]}, "m")
    later = {**finding, "first_event_at": "2026-11-03T09:00:00+00:00", "last_event_at": "2026-11-03T09:00:00+00:00",
             "events": "- 2026-11-03 09:00:00 UTC 로그인", "level": "주의"}
    results.save_monitor_run(results_db, {"last_event_at": "2026-11-03T09:00:00+00:00", "findings": [later]}, "m", stage="fast")

    assert results.next_monitor_since(results_db).isoformat() == "2026-11-02T11:00:00+00:00"
    assert results.next_monitor_since(results_db, "fast").isoformat() == "2026-11-03T09:00:00+00:00"
    shown = results.monitor_findings(results_db)
    assert [(f["user"], f["stage"]) for f in shown["findings"]] == [("kim.hj", "final"), ("kim.hj", "fast")]
    assert shown["findings"][0]["id"] == "kim.hj@2026-11-02T11:00:00+00:00"

    # 통계 · 의심 점수는 정밀 감시만 셉니다. "user" 칸이 PostgreSQL 의 current_user 로 바뀌지 않았는지도 봅니다.
    stats = results.threat_stats(results_db)
    assert stats["events"]["lines"]["위험"] == 2
    assert stats["events"]["users"][0]["log_id"] == "kim.hj"
    assert [f["log_id"] for f in results.user_findings(results_db, "2026-11-01T00:00:00+00:00")] == ["kim.hj"]


def test_snapshots_and_node_findings(results_db):
    snap = {"node": "web-01", "host": "web-01", "ip": "10.0.0.5", "collected_at": "2026-11-03T10:00:00+09:00",
            "collected_by": "root", "modules": {"ssh": {"permitrootlogin": "yes"}}, "sections": {}, "changes": ["root 로그인 열림"]}
    sid, inserted = results.save_snapshot(results_db, snap)
    assert inserted
    assert results.save_snapshot(results_db, snap) == (sid, False)
    assert results.latest_snapshot(results_db, "web-01")["collected_at"] == "2026-11-03T01:00:00+00:00"
    assert [s["id"] for s in results.pending_snapshots(results_db, {"web-01"})] == [sid]

    fid = results.save_node_finding(results_db, {"node": "web-01", "snapshot_id": sid, "host": "web-01", "level": "위험",
                                                 "summary": "root 로그인", "gaps": [GAP], "failed": False}, "m")
    assert results.pending_snapshots(results_db, {"web-01"}) == []
    latest = results.latest_node_findings(results_db)
    assert latest[0]["key"] == f"node_findings/{fid}" and latest[0]["sources"] == ["6.2 PAM"]
    assert results.node_history(results_db, "web-01")["findings"][0]["level"] == "위험"
    history = results.server_history(results_db, ["web-01", "db-01"], since="2026-11-03T00:00:00+00:00")
    assert len(history["snapshots"]) == 1 and len(history["findings"]) == 1

    servers = results.threat_stats(results_db)["servers"]
    assert servers["nodes"][0]["collected"] == 1 and servers["nodes"][0]["changed"] == 1
    assert servers["modules"][0]["module"] == "SSH"
    assert results.server_safety(results_db, ["web-01"], set())["score"] == 0
    with pytest.raises(Denied, match="수집 기록은 고칠 수 없습니다"), results_db.transaction() as conn:
        conn.execute("UPDATE server_snapshots SET host = 'x'")


def test_suspects_and_qa(results_db, people):
    person = {"key": "kim.hj", "department": "인사팀", "name": "김혜정", "log_id": "kim.hj", "login_id": "user",
              "signals": {"야간 접속": 3}, "findings": [{"level": "위험"}], "requests": [{"ai": "위험", "rejected_by": "1차", "stage": "rejected"}]}
    results.save_suspect(results_db, person, {"score": 80, "level": "높음", "reason": "야간 대량 다운로드", "failed": False}, "m")
    top = results.latest_suspects(results_db)[0]
    assert top["score"] == 80 and top["records"]["반려"] == 1
    assert results.user_safety(results_db)["score"] == 0

    results.save_qa(results_db, "logs", "어제 실패 로그인?", {"answer": "3건", "criteria": {"since": "어제"}, "facts": {"n": 3},
                                                       "failed": False, "elapsed_sec": 2.0}, "m", people["manager"])
    mine = results.my_qa(results_db, people["manager"], "logs")
    assert mine[0]["facts"] == {"n": 3} and mine[0]["failed"] is False
    assert results.my_qa(results_db, people["user"], "logs") == []
