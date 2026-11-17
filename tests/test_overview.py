"""보안 현황 종합 — 열린 것 · 결정 이어받기 · 사람에 붙은 결정 · 회수 · 판정 실패 · 추이 (모델 없이)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from sentinelai.db import auth, catalog, decisions, permissions, results
from sentinelai.engine.issue import Issuer
from sentinelai.engine.queue import Queues
from sentinelai.sources import Sources, overview

NOW = datetime(2026, 11, 15, 3, 0, tzinfo=timezone.utc)
EMPTY = {"reviews": [], "issues": [], "nodes": [], "events": [], "suspects": []}
NO_GRANTS = {"grants": [], "moves": [], "reviews": []}


def _at(day: int, hour: int = 1) -> str:
    return datetime(2026, 11, day, hour, tzinfo=timezone.utc).isoformat(timespec="seconds")


def _node(id_, day, level, gaps, failed=False):
    return {"id": id_, "node": "n1", "host": "web-1", "level": level, "failed": failed, "error": "시간 초과" if failed else None,
            "summary": "요약", "gaps": gaps, "created_at": _at(day)}


def _event(id_, day, level, failed=False):
    return {"id": id_, "user": "5", "subject": "재무 정다은", "level": level, "failed": failed, "error": "파싱 실패" if failed else None,
            "reason": "예외 출력", "created_at": _at(day), "last_event_at": _at(day)}


def _decision(id_, kind, key, action, day):
    return {"id": id_, "kind": kind, "item_key": key, "action": action, "decided_at": _at(day, 5), "decider_name": "운영자",
            "subject": "", "comment": ""}


def _log(*records):
    out: dict[str, dict[str, list]] = {}
    for r in records:
        out.setdefault(r["kind"], {}).setdefault(r["item_key"], []).append(r)
    return out


def _run(judged=EMPTY, grants=NO_GRANTS, log=None, since=None):
    items = overview.collect({**EMPTY, **judged}, grants, NOW.isoformat())
    return overview.summarize(items, log or {}, overview.revokes(items, grants), NOW, since)


def test_server_decision_carries_while_result_is_same():
    risky = [{"item": "permitrootlogin", "level": "위험"}]
    judged = {"nodes": [_node(1, 10, "위험", risky), _node(2, 12, "위험", risky)]}
    out = _run(judged, log=_log(_decision(1, "server", "node_findings/1", "done", 11)), since=_at(1))
    assert out["counts"]["위험"] == 0 and out["counts"]["completion"] == {"done": 1, "waiting": 0, "rate": 100}
    worse = {"nodes": [*judged["nodes"], _node(3, 13, "위험", [*risky, {"item": "sudo", "level": "주의"}])]}
    out = _run(worse, log=_log(_decision(1, "server", "node_findings/1", "done", 11)))
    assert out["counts"]["위험"] == 1 and out["top"][0]["key"] == "node_findings/3" and out["top"][0]["decision"] is None


def test_event_states_and_failed_apart():
    judged = {"events": [_event(1, 10, "위험"), _event(2, 10, "주의"), _event(3, 10, "주의"), _event(4, 10, None, failed=True)]}
    log = _log(_decision(1, "event", "event_findings/1", "act", 11), _decision(2, "event", "event_findings/2", "clear", 11))
    out = _run(judged, log=log)
    assert (out["counts"]["위험"], out["counts"]["주의"], out["counts"]["failed"]) == (1, 1, 1)
    assert out["counts"]["action"] == {"total": 2, "undecided": 1, "acting": 1}
    assert [r["key"] for r in out["top"]] == ["event_findings/1", "event_findings/3"]


def test_suspect_decision_follows_person():
    rows = [{"id": n, "person": "account:7", "subject": "영업팀 최지훈", "level": "높음", "failed": False, "error": None,
             "reason": "주말 대량 출력", "created_at": _at(9 + n)} for n in (1, 2)]
    out = _run({"suspects": rows}, log=_log(_decision(1, "suspect", "suspect/account:7", "done", 10)))
    assert out["counts"]["위험"] == 0 and out["counts"]["completion"]["done"] == 1
    assert _run({"suspects": rows})["areas"][3] == {"area": "suspect", "label": "위협 예측", "위험": 1, "주의": 0, "failed": 0}


def _grant(**more):
    return {"id": 1, "request_no": "REQ-20261101-001", "requester_id": 9, "requester_name": "김수영", "requester_department": "영업팀",
            "requested_access": "급여 테이블 조회", "period_end": "", "submitted_at": _at(1), "top_decided_at": _at(2),
            "revoked_at": None, "revoker_name": None, "revoke_reason": None, "left_on": None, **more}


def test_grant_review_until_revoked_and_leave():
    history = {"grants": [_grant()], "moves": [{"id": 3, "user_id": 9, "recorded_at": _at(5)}],
               "reviews": [{"id": 1, "request_id": 1, "move_id": 3, "level": "위험", "failed": False, "error": None,
                            "reason": "예전 업무 권한", "judged_at": _at(5, 2)}]}
    assert _run(grants=history)["counts"]["위험"] == 1
    revoked = {**history, "grants": [_grant(revoked_at=_at(8), revoker_name="운영자", revoke_reason="이동")]}
    out = _run(grants=revoked, since=_at(1))
    assert out["counts"]["위험"] == 0 and out["counts"]["completion"]["done"] == 1
    left = _run(grants={"grants": [_grant(left_on="2026-11-10")], "moves": [], "reviews": []})
    assert left["counts"]["위험"] == 1 and "퇴사" in left["top"][0]["reason"]


def test_recent_lists_what_completion_counts():
    judged = {"events": [_event(n, 10, "위험") for n in (1, 2, 3, 4)]}
    log = _log(_decision(1, "event", "event_findings/1", "done", 11), _decision(2, "event", "event_findings/2", "done", 3),
               _decision(3, "event", "event_findings/3", "done", 11), _decision(4, "event", "event_findings/3", "cancel", 12),
               _decision(5, "event", "event_findings/4", "act", 12))
    history = {"grants": [_grant(revoked_at=_at(13), revoker_name="운영자", revoke_reason="이동 뒤 필요 없음")], "moves": [{"id": 3, "user_id": 9, "recorded_at": _at(5)}],
               "reviews": [{"id": 1, "request_id": 1, "move_id": 3, "level": "위험", "failed": False, "error": None,
                            "reason": "예전 업무 권한", "judged_at": _at(5, 2)}]}
    out = _run(judged, history, log, since=_at(9))
    assert [(r["key"], r["label"], r["subject"], r["by"], r["note"]) for r in out["recent"]] == [
        ("grant/REQ-20261101-001", "회수", "영업팀 김수영 급여 테이블 조회", "운영자", "이동 뒤 필요 없음"),
        ("event_findings/1", "조치 완료", "재무 정다은", "운영자", "")]
    assert len(out["recent"]) == out["counts"]["completion"]["done"]


def test_policy_review_replaces_issues_and_trend():
    judged = {"reviews": [{"id": 1, "created_at": _at(10), "failed": False, "error": None},
                          {"id": 2, "created_at": _at(12), "failed": False, "error": None}],
              "issues": [{"id": 1, "review_id": 1, "kind": "충돌", "level": "위험", "policy_ids": ["정책.md 6.1"], "reason": "r"}]}
    out = _run(judged, since=_at(9))
    assert out["counts"]["위험"] == 0
    assert [(t["day"], t["위험"]) for t in out["trend"][:4]] == [("2026-11-09", 0), ("2026-11-10", 1), ("2026-11-11", 1), ("2026-11-12", 0)]


def test_issuer_overview_reads_both_dbs(main_db, results_db, people):
    item = catalog.create(main_db, people["top"], "HR_SALARY_READ", "급여 테이블 조회", "인사 시스템", "급여정보")
    no = permissions.submit(main_db, people["user"], item["code"], "업무")["request_no"]
    permissions.decide(main_db, people["manager"], no, "approve")
    permissions.decide(main_db, people["top"], no, "approve")
    auth.update_user(main_db, people["root"], people["user"].id, left_on=(date.today() - timedelta(days=1)).isoformat())
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    results.save_monitor_run(results_db, {"last_event_at": stamp, "findings": [
        {"user": "5", "subject": "재무 정다은", "first_event_at": stamp, "last_event_at": stamp, "events": "-", "level": "위험",
         "reason": "예외 출력", "failed": False}]}, "m")
    sources = Sources(SimpleNamespace(events_source=""), main_db, results_db, None)
    issuer = Issuer(SimpleNamespace(main_db=main_db, results_db=results_db, sources=sources), Queues())
    out = issuer.overview("month")
    assert out["counts"]["위험"] == 2 and {r["area"] for r in out["top"]} == {"grant", "event"}
    key = next(r["key"] for r in out["top"] if r["area"] == "event")
    decisions.record(main_db, people["manager"], "event", key, "done")
    out = issuer.overview("month")
    assert out["counts"]["위험"] == 1 and out["counts"]["completion"] == {"done": 1, "waiting": 1, "rate": 50}


def test_todos_keep_only_listed_items_of_the_area():
    from sentinelai.engine.worker import todos
    listed = {"event": [{"no": "T1", "area": "event", "key": "event_findings/1", "subject": "재무 정다은", "level": "위험"}],
              "server": [{"no": "T2", "area": "server", "key": "node_findings/2", "subject": "web-1", "level": "주의"}]}
    out = todos({"areas": [
        {"area": "로그 감시", "todos": [{"item": "[T1]", "task": "출력 승인 여부를 확인하십시오", "why": "위험, 결정 없음"},
                                     {"item": "T2", "task": "x", "why": "y"}, {"item": "T9", "task": "x", "why": "y"}]}]}, listed)
    assert [a["area"] for a in out["areas"]] == ["policy", "server", "event", "suspect", "grant"]
    assert out["areas"][2]["todos"] == [{"item": "T1", "key": "event_findings/1", "subject": "재무 정다은", "level": "위험",
                                         "task": "출력 승인 여부를 확인하십시오", "why": "위험, 결정 없음"}]
    assert out["checks"] == ["로그 감시: 다른 영역의 항목 T2 할 일을 뺐습니다", "로그 감시: 없는 항목 T9 할 일을 뺐습니다",
                             "서버 점검: 열린 항목이 있는데 영역을 빠뜨렸습니다"]


def test_briefing_runs_once_until_something_changes(main_db, results_db, people):
    from sentinelai.context import Inputs
    from sentinelai.engine.worker import AreaTodos, Briefing, Todo, Worker
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    results.save_monitor_run(results_db, {"last_event_at": stamp, "findings": [
        {"user": "5", "subject": "재무 정다은", "first_event_at": stamp, "last_event_at": stamp, "events": "-", "level": "위험",
         "reason": "예외 출력", "failed": False}]}, "m")
    settings = SimpleNamespace(num_ctx=16384, num_predict=8192, model="fake")
    sources = Sources(SimpleNamespace(events_source=""), main_db, results_db, None)
    res = SimpleNamespace(main_db=main_db, results_db=results_db, sources=sources, settings=settings, inputs=Inputs(settings))
    queues = Queues()
    issuer, worker = Issuer(res, queues), Worker(res, queues)
    seen = {}

    class Chain:
        def invoke(self, inputs):
            seen.update(inputs)
            return Briefing(headline="로그 감시 위험 1건", areas=[AreaTodos(area="로그 감시", todos=[
                Todo(item="T1", task="예외 출력 승인을 확인하십시오", why="위험, 결정 없음")])])

    worker._chains["briefing"] = Chain()
    issuer.issue("briefing")
    worker.drain()
    assert "[T1] 위험 · 재무 정다은 · 결정 없음" in seen["items"] and "## 서버 점검 — 열린 항목 없음" in seen["items"]
    out = issuer.overview("month")["briefing"]
    assert out["current"] and out["areas"][2]["todos"][0]["key"].startswith("event_findings/") and out["checks"] == []
    assert issuer.issue("briefing", auto=True, skip_same=True).context == {"skipped": True}
    worker.drain()
    decisions.record(main_db, people["manager"], "event", out["areas"][2]["todos"][0]["key"], "act")
    assert issuer.overview("month")["briefing"]["current"] is False
    assert issuer.issue("briefing", auto=True, skip_same=True).total == 1
