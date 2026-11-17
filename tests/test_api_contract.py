"""API 응답 모델 — 선언한 칸이 DB 가 주는 칸과 같고, 화면 타입 파일이 지금 코드에서 만든 것과 같은지 봅니다."""
from __future__ import annotations

from sentinelai import dev
from sentinelai.db import auth, catalog, decisions, nodes, permissions, regulations, watch
from sentinelai.web.responses import AccessItem, AuditRow, DecisionRecord, Me, Node, Regulation, UserRow, WatchFlag, WatchPerson


def test_frontend_types_are_current():
    current = dev.API_TYPES.read_text(encoding="utf-8")
    assert dev.api_types_text() == current, "요청 · 응답 모델이 바뀌었습니다 — python -m sentinelai.dev api-types 로 화면 타입을 다시 만드세요"


def test_response_models_declare_every_column(main_db, people):
    """응답 모델에 없는 칸은 응답에서 빠지므로, DB 에 칸을 더하면 모델에도 더해야 합니다."""
    root = people["root"]
    item = catalog.create(main_db, root, "HR_SALARY_READ", "급여 테이블 조회")
    regulations.create(main_db, root, "a.md", "가")
    rows = {
        Me: root.public(),
        UserRow: auth.list_users(main_db, root)[0],
        AccessItem: item,
        Regulation: regulations.list_all(main_db)[0],
        AuditRow: watch.history(main_db, "user", str(people["user"].id))[0],
        Node: nodes.create(main_db, people["manager"], "web-01")[0],
        DecisionRecord: decisions.record(main_db, people["manager"], "event", "event_findings/1", "act", ai_level="위험"),
    }
    for model, row in rows.items():
        assert set(row) == set(model.model_fields), model.__name__
        model.model_validate(row)


def test_watch_people_fit_the_model(main_db, people):
    """확인할 사람 — 걸린 일(flags)마다 칸이 조금씩 달라 모델보다 많지만 않으면 됩니다."""
    root, user = people["root"], people["user"]
    item = catalog.create(main_db, root, "HR_SALARY_READ", "급여 테이블 조회")
    no = permissions.submit(main_db, user, item["code"], "급여 정산 업무")["request_no"]
    permissions.decide(main_db, people["manager"], no, "approve")
    permissions.decide(main_db, people["top"], no, "approve")
    auth.update_user(main_db, root, user.id, department="영업팀", left_on="2020-01-01")
    person = next(p for p in permissions.watch_people(main_db) if p["id"] == user.id)
    assert set(person) == set(WatchPerson.model_fields)
    assert {f["kind"] for f in person["flags"]} == {"leave", "move"}
    for flag in person["flags"]:
        assert set(flag) <= set(WatchFlag.model_fields)
    WatchPerson.model_validate(person)


# --- 판정 · 집계 · 큐 API — 명세에만 올린 모양이 실제 라우트가 돌려주는 값과 같은지 ---
# 이 API 들은 응답을 건드리지 않으므로(responses 의 model) 여기서 어긋나면 화면 타입이 틀린 것입니다.

import asyncio  # noqa: E402
import time  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from types import SimpleNamespace  # noqa: E402

import pytest  # noqa: E402
from fastapi import HTTPException, Request  # noqa: E402
from langchain_core.messages import AIMessage  # noqa: E402

from sentinelai.ask import Agent  # noqa: E402
from sentinelai.db import results  # noqa: E402
from sentinelai.engine import Engine  # noqa: E402
from sentinelai.engine.issue import Issuer  # noqa: E402
from sentinelai.engine.queue import Queues  # noqa: E402
from sentinelai.engine.resource import Resources  # noqa: E402
from sentinelai.sources import Sources, behavior_signals, load_events  # noqa: E402
from sentinelai.web import api_nodes, api_permissions, api_regulations, main  # noqa: E402
from sentinelai.web import responses as R  # noqa: E402
from sentinelai.web.contract import _routes, declared, mismatch, unfit  # noqa: E402
from tests.test_ask_agent import DONE, PLAN, FakeDocs, FakeModel, call  # noqa: E402
from tests.test_pdf_text import _pdf as pdf_pages  # noqa: E402
from tests.test_xlsx_text import _book as xlsx_book  # noqa: E402

LOG = "data/연습용_로그_원본+합성.csv"   # 재무 정다은 = 로그 사용자 ID "5"


def test_mismatch_catches_what_it_should():
    ok = {"node": "web-01", "stored": True}
    assert mismatch(R.SnapshotReceipt, ok) == []
    assert mismatch(R.SnapshotReceipt, {**ok, "more": 1}) == ["$.more: 선언에 없는 칸"]
    assert mismatch(R.SnapshotReceipt, {"node": "web-01", "stored": 1}) != []      # 1 은 참이 아닙니다
    assert mismatch(R.SnapshotReceipt, {"node": "web-01"}) != []                    # 빠진 칸
    assert mismatch(R.Rejudging, {"request_no": 3, "judging": True}) != []          # 숫자는 글자가 아닙니다
    # 응답을 선언에 맞추는 API 는 1 을 참으로 바꿔 주므로 그건 넘어가고, 빠질 칸과 못 맞출 값만 짚습니다.
    assert unfit(R.SnapshotReceipt, {"node": "web-01", "stored": 1}) == []
    assert unfit(R.SnapshotReceipt, {**ok, "more": 1}) == ["$.more: 선언에 없는 칸"]
    assert unfit(R.SnapshotReceipt, {"node": "web-01", "stored": "글자"}) != []
    paths = {path: enforced for path, _, enforced in declared(main.app)}
    assert paths["/api/users"] is True and paths["/api/results"] is False and "/api/nodes/{name}" not in paths


def _at(days: float = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")


def _approved(main_db, people, who, code, period_end="", verdict=None):
    no = permissions.submit(main_db, who, code, "업무상 필요", period_end=period_end)["request_no"]
    if verdict:
        permissions.save_ai_verdict(main_db, no, verdict, "m")
    permissions.decide(main_db, people["manager"], no, "approve", "확인")
    permissions.decide(main_db, people["top"], no, "approve")
    return no


VERDICT = {"level": "위험", "reason": "직무와 무관", "recommendation": "반려하십시오", "sources": ["접근권한_관리기준.md 3.3"],
           "failed": False, "elapsed_sec": 21.5, "grounding": {"checks": []}}
GAPS = [{"item": "[SSH] permitrootlogin", "current": "yes", "required": "no", "source": "정책_운영기준.md 6.2", "level": "위험", "change": "no 로 바꿈"},
        {"item": "[UFW] 상태", "current": "켜짐", "required": "켜짐", "source": "정책_운영기준.md 5.2", "level": "정상", "change": ""}]


@pytest.fixture
def world(main_db, results_db, people):
    """판정 종류마다 성공 · 실패 · 사람의 결정이 하나씩은 있게 두 DB 를 채웁니다. → 라우트에 넘길 request"""
    root, manager, user, user2 = people["root"], people["manager"], people["user"], people["user2"]
    yesterday = (datetime.now().astimezone().date() - timedelta(days=1)).isoformat()
    for code, name in (("HR_SALARY_READ", "급여 테이블 조회"), ("FW_POLICY_CHANGE", "방화벽 정책 변경"), ("CRM_READ", "CRM 조회"),
                       ("PROD_DB_ADMIN", "운영 DB 관리자"), ("PAM_SERVER_ADMIN", "PAM 경유 서버 관리자")):
        catalog.create(main_db, root, code, name, "시스템", "분류")

    # 권한 신청 — 승인 뒤 이동(재검토 있음 · 없음), 판정 실패 뒤 1차 반려, 판정 없는 대기, 만료 미회수, 회수, 퇴사자 보유
    moved = _approved(main_db, people, user, "HR_SALARY_READ", verdict=VERDICT)
    _approved(main_db, people, user, "PAM_SERVER_ADMIN")
    _approved(main_db, people, user, "PROD_DB_ADMIN", period_end=yesterday)
    failed = permissions.submit(main_db, user, "FW_POLICY_CHANGE", "방화벽 점검")["request_no"]
    permissions.save_ai_verdict(main_db, failed, {"failed": True, "error": "시간 초과", "elapsed_sec": 3.0}, "m")
    permissions.decide(main_db, manager, failed, "reject", "사유 부족")
    waiting = permissions.submit(main_db, user, "CRM_READ", "고객 응대")["request_no"]
    time.sleep(1.1)  # 이동이 신청 시각보다 늦게 기록돼야 재검토 대상입니다 (시각은 초 단위)
    auth.update_user(main_db, root, user.id, department="영업팀", log_id="5")
    move_id = next(int(t.split(":")[2]) for t in permissions.pending_grant_reviews(main_db) if t.split(":")[1] == moved)
    permissions.save_grant_review(main_db, moved, move_id, {**VERDICT, "level": "주의"}, "m")
    revoked = _approved(main_db, people, user2, "HR_SALARY_READ", verdict={**VERDICT, "level": "주의"})
    permissions.revoke(main_db, manager, revoked, "업무 종료")
    _approved(main_db, people, user2, "FW_POLICY_CHANGE", verdict={**VERDICT, "level": "정상"})
    auth.update_user(main_db, root, user2.id, left_on=yesterday)

    # 정책 관리 검토 — 같은 문제가 두 번 나와 지난 결정을 이어받습니다. 그 뒤 실패한 검토는 따로 봅니다.
    review = {"summary": "충돌 1건", "failed": False, "elapsed_sec": 40.2, "grounding": {"checks": []}, "issues": [
        {"kind": "충돌", "level": "위험", "policy_ids": ["정책_운영기준.md 5.1", "정책_운영기준.md 6.1"], "reason": "서로 다름", "recommendation": "하나로"}]}
    results.save_policy_review(results_db, review, "m")
    decisions.record(main_db, manager, "policy", "policy_issues/1", "cond", "5.1 ↔ 6.1", "다음 분기까지", ai_level="위험")
    results.save_policy_review(results_db, review, "m")

    # 서버 점검 — 성공(정상 항목 포함) · 실패
    for name, finding in (("web-01", {"level": "위험", "summary": "루트 로그인 허용", "gaps": GAPS, "unjudged": ["PAM"], "failed": False, "elapsed_sec": 30.1}),
                          ("db-01", {"failed": True, "error": "빈 출력"})):
        nodes.create(main_db, manager, name)
        base = {"node": name, "host": name, "ip": "10.0.0.5", "collected_by": "root", "sections": {}}
        results.save_snapshot(results_db, {**base, "collected_at": _at(2), "modules": {"sshd": {"permitrootlogin": "no"}}, "changes": []})
        sid, _ = results.save_snapshot(results_db, {**base, "collected_at": _at(1), "modules": {"sshd": {"permitrootlogin": "yes"}},
                                                    "changes": ["[SSH] permitrootlogin: no → yes"]})
        nodes.mark_collected(main_db, name, _at(1))
        results.save_node_finding(results_db, {**base, "snapshot_id": sid, "state": {}, "matched": "", "grounding": {}, **finding}, "m")
    decisions.record(main_db, manager, "server", "node_findings/1", "act", "web-01", ai_level="위험")

    # 로그 감시 — 확정(위험 · 정상 · 실패)과 아직 확정 전인 1차 판정
    def finding(level, days, **more):
        return {"user": "5", "subject": "재무 정다은", "first_event_at": _at(days), "last_event_at": _at(days), "level": level,
                "events": f"- {datetime.now(timezone.utc) - timedelta(days=days):%Y-%m-%d %H:%M:%S} UTC [SecureMark] 출력", "reason": "예외 출력",
                "recommendation": "확인", "sources": ["접근권한_관리기준.md 3.3"], "failed": False, "elapsed_sec": 12.0, "grounding": {}, **more}
    results.save_monitor_run(results_db, {"source": LOG, "last_event_at": _at(1), "findings": [
        finding("위험", 1), finding("정상", 1.1), finding(None, 1.2, failed=True, error="파싱 실패", elapsed_sec=None)]}, "m", stage="final")
    results.save_monitor_run(results_db, {"source": LOG, "load_issues": ["다른.csv: 컬럼이 맞지 않음"], "last_event_at": _at(0),
                                          "findings": [finding("주의", 0)]}, "m", stage="fast")
    decisions.record(main_db, manager, "event", "event_findings/1", "done", "재무 정다은", ai_level="위험")

    # 위협 예측 — 계정에 이은 사람(성공)과 계정 없는 로그 사용자(실패)
    signals = behavior_signals(load_events(LOG).records)["5"]
    results.save_suspect(results_db, {"key": f"account:{user.id}", "department": "영업팀", "name": "사용자", "log_id": "5", "login_id": "user",
                                      "signals": signals, "findings": [{"level": "위험"}], "requests": [{"ai": "위험", "rejected_by": None, "stage": "approved"}]},
                         {"score": 82, "level": "높음", "reason": "예외 승인 몰림", "watch": "출력 사유", "failed": False, "elapsed_sec": 18.0, "grounding": {"checks": []}}, "m")
    results.save_suspect(results_db, {"key": "log:9", "department": "외주개발", "name": "이준호", "log_id": "9", "login_id": None, "signals": None,
                                      "findings": [], "requests": []}, {"failed": True, "error": "빈 출력"}, "m")
    decisions.record(main_db, manager, "suspect", f"suspect/account:{user.id}", "clear", "영업팀 사용자")

    # AI 비서
    todo = {"item": "T1", "key": "event_findings/1", "subject": "재무 정다은", "level": "위험", "task": "출력 사유를 확인할지 정하십시오", "why": "위험"}
    areas = [{"area": a, "label": label, "todos": [todo] if a == "event" else []} for a, label in
             (("policy", "정책 관리"), ("server", "서버 점검"), ("event", "로그 감시"), ("suspect", "위협 예측"), ("grant", "보유 권한 재검토"))]
    results.save_briefing(results_db, {"headline": "로그 감시부터", "areas": areas, "fingerprint": "x", "failed": False, "elapsed_sec": 9.5,
                                       "grounding": {"checks": ["없는 항목 T9 할 일을 뺐습니다"]}}, "m")

    settings = SimpleNamespace(events_source=LOG, qa_model="m")
    sources = Sources(settings, main_db, results_db, FakeDocs())
    engine = Engine.__new__(Engine)
    engine.res = SimpleNamespace(main_db=main_db, results_db=results_db, sources=sources, settings=settings)
    engine.settings, engine.queues, engine._started = settings, Queues(), True
    engine.issuer = Issuer(engine.res, engine.queues)
    state = SimpleNamespace(main_db=main_db, results_db=results_db, engine=engine, slack_url="", mail=None)
    return SimpleNamespace(app=SimpleNamespace(state=state), client=None, cookies={}, headers={}, waiting=waiting)


def test_results_shape(world, people):
    for who in ("top", "manager"):
        out = main.results(world, people[who])
        assert mismatch(R.Results, out) == []
        assert "decision_log" in out
    assert out["policy_review"]["issues"] and out["decisions"]["policy"]["policy_issues/2"]["carried_from"] == "policy_issues/1"
    assert {s["failed"] for s in out["servers"]} == {True, False} and len(out["servers"][1]["gaps"]) == 1
    assert {e["stage"] for e in out["events"]} == {"fast", "final"} and any(e["failed"] for e in out["events"])
    assert out["summary"]["failed"] == 2 and out["sections"]["events"]["load_issues"]


def test_failed_policy_review_shape(world, people, results_db):
    results.save_policy_review(results_db, {"failed": True, "error": "빈 출력", "elapsed_sec": None}, "m")
    out = main.results(world, people["top"])
    assert mismatch(R.Results, out) == [] and out["policy_review"]["issues"] == []


def test_request_shapes(world, people):
    rows = api_permissions.list_requests(world, people["top"], None, False)
    assert mismatch(list[R.RequestRow], rows) == []
    causes = {r["grant_review"]["cause"]: r["grant_review"] for r in rows if r["grant_review"] and r["grant_review"]["verdict"]}
    assert causes["leave"]["verdict"]["by"] == "code" and causes["move"]["verdict"]["by"] == "ai" and causes["move"]["judging"] is False
    assert any(r["grant_review"] and r["grant_review"]["verdict"] is None for r in rows)          # 이동했지만 재검토 전
    assert any(r["ai_verdict"] and r["ai_verdict"]["failed"] for r in rows) and any(r["ai_verdict"] is None for r in rows)
    assert any(r["revocation"] for r in rows) and {a["action"] for r in rows for a in r["approvals"]} == {"approve", "reject"}
    mine = api_permissions.list_requests(world, people["user"], None, True)
    assert mismatch(list[R.RequestRow], mine) == []
    assert all("ai_verdict" not in r and "judging" not in r and all("ai_level" not in a for a in r["approvals"]) for r in mine)
    assert mismatch(R.Rejudging, api_permissions.rejudge(world.waiting, world, people["manager"])) == []


def test_node_shapes(world, people):
    for name in ("web-01", "db-01"):
        detail = api_nodes.node_detail(name, world, people["manager"])
        assert mismatch(R.NodeDetail, detail) == []
        assert detail["latest"]["modules"] and len(detail["snapshots"]) == 2 and detail["findings"]
    rows = api_nodes.list_nodes(world, people["manager"])
    assert mismatch(list[R.NodeRow], rows) == [] and {r["finding_failed"] for r in rows} == {True, False}


def test_stats_shapes(world, people):
    for period in ("week", "all"):
        stats = main.stats(world, people["manager"], period)
        assert mismatch(R.Stats, stats) == []
        users = main.user_stats(world, people["manager"], period)
        assert mismatch(R.UserStats, users) == []
        assert mismatch(R.Overview, main.overview(world, people["manager"], period)) == []
    assert stats["servers"]["nodes"] and stats["servers"]["modules"] and stats["servers"]["clauses"] and stats["safety"]["items"]
    assert stats["logs"]["count"] and stats["events"]["days"]
    assert {s["failed"] for s in users["suspects"]} == {True, False} and users["events"]["users"]
    held = {s["key"]: s["held"] for s in users["suspects"]}
    assert held["log:9"] is None and held[f"account:{people['user'].id}"]
    overview = main.overview(world, people["manager"], "month")
    assert overview["briefing"]["areas"][2]["todos"] and overview["top"] and overview["failed"]
    assert any(r["decision"] for r in [*overview["top"], *overview["failed"]]) or overview["counts"]["completion"]["done"]


def test_stats_without_logs_shape(world, people):
    world.app.state.engine.res.sources = Sources(SimpleNamespace(events_source="없는.csv"), world.app.state.main_db, world.app.state.results_db, None)
    stats = main.stats(world, people["manager"], "month")
    assert mismatch(R.Stats, stats) == [] and stats["logs"]["count"] is None and stats["logs"]["error"]
    risk = main.risk_people(world, people["manager"])
    assert mismatch(R.RiskPeople, risk) == [] and risk["log_error"]


def test_risk_people_and_logs_shapes(world, people):
    risk = main.risk_people(world, people["manager"])
    assert mismatch(R.RiskPeople, risk) == []
    assert {f["kind"] for p in risk["people"] for f in p["flags"]} == {"move", "grant", "expired", "event"}
    page = main.browse_logs(world, people["manager"], "all", "", "", "", 1)
    assert mismatch(R.LogsPage, page) == [] and page["events"] and page["facts"]["attribute_totals"]
    picked = main.browse_logs(world, people["manager"], "all", "재무 정다은", "SecureMark", "", 1)
    assert mismatch(R.LogsPage, picked) == [] and picked["criteria"] == {"user": "재무 정다은", "solution": "SecureMark"}
    assert mismatch(R.LogsPage, main.browse_logs(world, people["manager"], "day", "", "", "", 1)) == []   # 로그가 없는 기간


def test_queue_shapes(world, people):
    engine = world.app.state.engine
    assert mismatch(R.Jobs, main.jobs(world)) == [] and mismatch(R.QueueDetail, main.queue_detail(world, people["top"])) == []
    engine.issuer.every("events_fast", 5)
    engine.issuer.every("nodes", 30)
    engine.queues.fill(engine.queues.open("nodes", auto=True), [("nodes:web-01", {}), ("nodes:db-01", {})])
    engine.queues.open("suspects")
    engine.enqueue_request(world.waiting)
    running = engine.queues.take(engine.queues.generation)
    engine.queues.finish(running, engine.queues.generation, "failed", "모델 응답 없음", None)
    engine.queues.take(engine.queues.generation)
    engine.queues.record("briefing", "로그를 읽지 못했습니다", True)
    jobs, detail, status = main.jobs(world), main.queue_detail(world, people["top"]), main.internal_status(world)
    assert mismatch(R.Jobs, jobs) == [] and mismatch(R.QueueDetail, detail) == [] and mismatch(R.QueueStatus, status) == []
    assert jobs["running"] == "nodes" and jobs["fast"] and jobs["waiting"] and jobs["last"]
    assert detail["current"] and detail["batches"] and any(lane["jobs"] for lane in detail["lanes"]) and detail["schedule"]
    assert set(detail["last"]) == {"request", "briefing"} and status["verdicts"]["waiting"] == []
    engine._started = False
    assert mismatch(R.Jobs, main.jobs(world)) == [] and mismatch(R.QueueStatus, main.internal_status(world)) == []


def test_health_shape():
    settings = SimpleNamespace(ollama_base_url="http://127.0.0.1:1", model="m", qa_model="q", embedding_model="e")
    out = Resources.health(SimpleNamespace(settings=settings, documents=SimpleNamespace(is_empty=lambda: False)))
    assert mismatch(R.Health, out) == [] and out["error"] and not out["ok"]


def test_ask_shapes(world, people):
    engine, manager = world.app.state.engine, people["manager"]
    plan = AIMessage(PLAN.content.replace("기준: 출력 행위", "기준: 기준 문서의 출력 조항"))   # 조항을 안 찾으면 코드가 찾습니다
    replies = [plan, call("find_logs", {"keyword": "재무 정다은", "how": "출력"}), DONE, AIMessage("T1-3: 출력 건수"), AIMessage("출력을 48번 했습니다.")]
    engine.__dict__["agent"] = Agent(FakeModel(replies), engine.res.sources)
    answer = main.ask(main.AskRequest(question="재무 정다은이 출력을 몇 번 했어?"), world, manager)
    assert mismatch(R.AskAnswer, answer) == [] and not answer["failed"]
    assert {s["tool"] for s in answer["steps"]} == {"find_logs", "search_regulations"} and answer["steps"][-1]["by"] == "code"
    engine.__dict__["agent"] = Agent(FakeModel([]), engine.res.sources)     # 답할 것이 없어 실패하는 모델
    broken = main.ask(main.AskRequest(question="그중 예외 승인은?", conversation_id=answer["conversation_id"]), world, manager)
    assert mismatch(R.AskAnswer, broken) == [] and broken["failed"]
    union = list[R.QaRecord] | list[R.Conversation]
    conversations = main.my_qa(world, manager, None)
    assert mismatch(union, conversations) == [] and conversations[0]["turns"] == 2
    turns = main.my_qa(world, manager, answer["conversation_id"])
    assert mismatch(union, turns) == [] and turns[0]["steps"] and turns[1]["failed"]
    assert mismatch(union, main.my_qa(world, people["top"], None)) == []      # 남의 대화는 안 보여 빈 목록


def _upload(data: bytes) -> Request:
    scope = {"type": "http", "method": "POST", "headers": [(b"content-length", str(len(data)).encode())]}

    async def receive() -> dict:
        return {"type": "http.request", "body": data, "more_body": False}

    return Request(scope, receive)


def test_extract_shapes():
    tables = asyncio.run(api_regulations.extract_xlsx(_upload(xlsx_book())))
    assert mismatch(R.ExtractedTables, tables) == [] and tables["tables"]
    text = asyncio.run(api_regulations.extract_pdf(_upload(pdf_pages("1. 목적", None))))
    assert mismatch(R.ExtractedPdf, text) == [] and text["empty_pages"] == [2]


def test_regulation_index_shape():
    chunks = [SimpleNamespace(metadata={"source": n}) for n in ("a.md", "a.md", "b.md")]
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(engine=SimpleNamespace(documents=SimpleNamespace(chunks=lambda: chunks)))))
    out = api_regulations.regulation_index(request)
    assert mismatch(R.RegulationIndex, out) == [] and out["chunks"] == {"a.md": 2, "b.md": 1}


def test_regulation_routes_open_to_manager_and_top():
    """기준 문서는 보안 운영자 이상의 일 — 팀 main 에서 따로 온 라우트도 같은지 봅니다."""
    def passes(check, who: str) -> bool:
        try:
            check(SimpleNamespace(role=who))
            return True
        except HTTPException:
            return False

    seen = 0
    for path, route in _routes(main.app):
        if not path.startswith("/api/regulations"):
            continue
        checks = [d.call for d in route.dependant.dependencies if d.call.__qualname__ == "role.<locals>.check"]
        checks += [d.call for dep in route.dependant.dependencies for d in dep.dependencies if d.call.__qualname__ == "role.<locals>.check"]
        assert checks, f"{path} 에 역할 검사가 없습니다"
        assert all(passes(c, "manager") and passes(c, "top") and not passes(c, "user") for c in checks), path
        seen += 1
    assert seen >= 6


def test_every_route_declares_its_shape():
    """새 API 는 돌려주는 모양을 선언해야 합니다 — response_model 이나 responses 의 model 로."""
    missing = []
    for path, methods in main.app.openapi()["paths"].items():
        for method, spec in methods.items():
            shapes = [spec["responses"].get(code, {}).get("content", {}).get("application/json", {}).get("schema", {}) for code in ("200", "201", "202")]
            if not any("$ref" in str(s) for s in shapes):
                missing.append(f"{method.upper()} {path}")
    assert missing == []


def test_event_levels_count_normal_but_list_only_caution_up():
    from sentinelai.web import view
    row = {"id": "u@t", "subject": "재무 김", "events": "", "first_event_at": "t", "last_event_at": "t", "elapsed_sec": 1.0,
           "reason": "r", "sources": [], "recommendation": "c", "error": None, "stage": "final"}
    events = {"generated_at": "t", "source": "f", "load_issues": [], "findings": [{**row, "key": f"event_findings/{i}", "level": lv, "failed": failed}
                           for i, (lv, failed) in enumerate([("정상", False), ("정상", False), ("주의", False), ("정상", True)])]}
    out = view.results(None, events, [])
    assert out["event_levels"] == {"정상": 2, "주의": 2, "위험": 0}   # 판정 실패는 주의로 셈
    assert [f["key"] for f in out["events"]] == ["event_findings/2", "event_findings/3"]
