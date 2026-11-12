"""질의 도구 — 연습용 로그 · 시험 DB 로 도구마다 결과 · 바로잡기 · 감사 기록을 봅니다 (모델 없이)."""
from __future__ import annotations

import json
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from langchain_core.documents import Document

from sentinelai.ask import TOOLS, Context
from sentinelai.sources import Sources, load_events, search

LOG = "data/연습용_로그_원본+합성.csv"


class FakeDocs:
    def search(self, query: str, k: int | None = None) -> list[Document]:
        return [Document(page_content="### 3.3 급여 정보 접근\n인사팀장의 사전 승인을 필수로 한다.", metadata={"source": "접근권한_관리기준.md"})]


@pytest.fixture
def ctx(main_db, results_db, people):
    sources = Sources(SimpleNamespace(events_source=LOG), main_db, results_db, FakeDocs())
    return Context(sources, user=people["manager"], ip="127.0.0.1")


def test_tool_specs_have_mcp_shape():
    for tool in TOOLS.values():
        spec = tool.spec()
        assert spec["name"] == tool.name and spec["description"] and spec["inputSchema"]["type"] == "object"
        assert tool.openai()["function"]["parameters"] == spec["inputSchema"]


def test_find_logs_moves_name_out_of_keyword_and_records_view(ctx, main_db):
    res = TOOLS["find_logs"].call(ctx, {"keyword": "재무 정다은", "how": "출력"})
    expected = len(search(load_events(LOG).records, user="재무 정다은", how="출력"))
    assert res.criteria == {"user": "재무 정다은", "how": "출력"} and res.facts["count"] == expected > 0
    assert '"count": %d' % expected in res.text
    with main_db.connection() as conn:
        row = conn.execute("SELECT detail FROM audit_log WHERE action = 'log_view' ORDER BY id DESC LIMIT 1").fetchone()
    assert json.loads(row["detail"])["via"] == "ask"


def test_find_logs_fixes_filled_choices(ctx):
    expected = len(search(load_events(LOG).records, user="재무 정다은"))
    res = TOOLS["find_logs"].call(ctx, {"user": "재무 정다은", "where": "PC,VDI", "how": "PrintCount"})
    assert res.facts["count"] == expected and res.criteria["where"] == "PC,VDI" and "how=PrintCount" in res.text
    zero = TOOLS["find_logs"].call(ctx, {"user": "재무 정다은", "department": "인사"})
    assert zero.facts["count"] == 0 and f'"user=재무 정다은": {expected}' in zero.text


def test_find_logs_drops_whole_log_period(ctx):
    v = ctx.vocabulary
    res = TOOLS["find_logs"].call(ctx, {"user": "정다은", "since": v["first"], "until": v["last"]})
    assert "since" not in res.criteria and "until" not in res.criteria
    bad = TOOLS["find_logs"].call(ctx, {"since": "어제"})
    assert bad.summary == "기간 오류"


def test_person_asks_back_when_ambiguous(ctx):
    assert TOOLS["person"].call(ctx, {"who": "재무"}).summary == "후보 2명"
    one = TOOLS["person"].call(ctx, {"who": "정다은"})
    assert one.summary == "재무 정다은" and "로그 48건" in one.text
    assert TOOLS["person"].call(ctx, {"who": "없는사람"}).summary == "사람 없음"


def test_regulations_servers_findings_without_data(ctx):
    reg = TOOLS["search_regulations"].call(ctx, {"query": "급여"})
    assert reg.sources == ["접근권한_관리기준.md"] and "3.3" in reg.text
    assert TOOLS["servers"].call(ctx, {"nodes": "없는노드"}).text.startswith("[모르는 노드] 없는노드")
    for kind in ("events", "policies", "suspects"):
        assert TOOLS["findings"].call(ctx, {"kind": kind}).summary.endswith(" 0건")


def test_query_finds_holders_by_fuzzy_access(ctx, main_db, people):
    from sentinelai.db import catalog, permissions
    top, manager = people["top"], people["manager"]
    catalog.create(main_db, top, "SALARY_READ", "급여 테이블 조회", "인사 시스템", "급여정보")
    catalog.create(main_db, top, "SALARY_PRINT", "급여 테이블 출력", "급여 시스템", "급여정보")
    catalog.create(main_db, top, "CRM_READ", "CRM 조회", "영업 시스템", "고객정보", "고객 권한")
    for who, code in ((people["user"], "SALARY_READ"), (people["user2"], "SALARY_PRINT"), (people["user2"], "CRM_READ")):
        no = permissions.submit(main_db, who, code, reason="업무")["request_no"]
        permissions.decide(main_db, manager, no, "approve")
        permissions.decide(main_db, top, no, "approve")
    pending = permissions.submit(main_db, people["user"], "SALARY_PRINT", reason="정산")["request_no"]

    res = TOOLS["query"].call(ctx, {"dataset": "grants", "access": "급여 테이블 권한"})
    assert res.facts == {"count": 2, "people": 2} and "SALARY_READ" in res.text and "CRM_READ" not in res.text
    by_dept = TOOLS["query"].call(ctx, {"dataset": "grants", "access": "급여테이블", "group_by": "department"})
    assert by_dept.facts["groups"] == {"인사팀": 1, "개발팀": 1}
    waiting = TOOLS["query"].call(ctx, {"dataset": "requests", "stage": "1차 결재 대기"})
    assert waiting.facts["count"] == 1 and pending in waiting.text
    holders = TOOLS["query"].call(ctx, {"dataset": "accounts", "access": "CRM"})
    assert holders.facts["count"] == 1 and "사용자둘" in holders.text and "password" not in holders.text
    none = TOOLS["query"].call(ctx, {"dataset": "grants", "access": "방화벽"})
    assert none.summary == "권한 없음" and "급여 테이블 조회(SALARY_READ)" in none.text


def test_query_where_fields_sort_and_ids(ctx, main_db, people):
    from sentinelai.db import catalog, permissions
    top, manager = people["top"], people["manager"]
    catalog.create(main_db, top, "SALARY_READ", "급여 테이블 조회", "인사 시스템", "급여정보")
    catalog.create(main_db, top, "CRM_READ", "CRM 조회", "영업 시스템", "고객정보")
    soon = (date.today() + timedelta(days=5)).isoformat()
    nos = []
    for who, code, end in ((people["user"], "SALARY_READ", soon), (people["user2"], "CRM_READ", "")):
        no = permissions.submit(main_db, who, code, reason="업무", period_end=end)["request_no"]
        permissions.decide(main_db, manager, no, "approve")
        permissions.decide(main_db, top, no, "approve")
        nos.append(no)
    call = lambda **kw: TOOLS["query"].call(ctx, kw)

    assert call(dataset="grants", expires_within=7).facts["count"] == 1
    assert call(dataset="grants", where=[{"field": "period_end", "op": "empty"}]).facts["count"] == 1
    assert call(dataset="accounts", where=[{"field": "is_active", "op": "=", "value": "true"},
                                           {"field": "role", "op": "=", "value": "일반 사용자"}]).facts["count"] == 2
    picked = call(dataset="grants", fields=["name", "access"], sort="-name")
    assert picked.text.index("name 사용자둘,") < picked.text.index("name 사용자,")
    assert f"request_no {nos[1]}, name 사용자둘, access CRM 조회" in picked.text
    again = call(dataset="grants", ids=[nos[0], "REQ-20000101-001"])
    assert again.facts == {"count": 1, "people": 1, "not_found": ["REQ-20000101-001"]}
    bad = call(dataset="grants", where=[{"field": "password_hash", "op": "not_empty"}])
    assert bad.summary == "칸 오류" and "request_no" in bad.text


def test_query_meaning_lets_model_pick_and_code_counts(ctx, main_db, people):
    from langchain_core.messages import AIMessage
    from sentinelai.db import catalog, permissions
    catalog.create(main_db, people["top"], "SALARY_READ", "급여 테이블 조회", "인사 시스템", "급여정보")
    nos = [permissions.submit(main_db, who, "SALARY_READ", reason=why)["request_no"]
           for who, why in ((people["user"], "급여 정산"), (people["user2"], "마케팅 업무"))]
    seen = []
    ctx.llm = SimpleNamespace(invoke=lambda msgs: seen.append(msgs[0].content) or AIMessage("<think>…</think>\n2: 마케팅 사유로 급여 권한\n9: 없는 행"))
    res = TOOLS["query"].call(ctx, {"dataset": "requests", "meaning": "사유가 권한과 맞지 않음"})
    assert res.facts == {"count": 1, "people": 1, "candidates": 2} and nos[1] in res.text and nos[0] not in res.text.split("[행")[1]
    assert "맞는 이유(AI 판정 아님): 마케팅 사유로 급여 권한" in res.text and "1. " in seen[0] and "사유: 마케팅 업무" in seen[0]
    ctx.llm = None
    assert TOOLS["query"].call(ctx, {"dataset": "requests", "meaning": "x"}).summary == "meaning 없음"
