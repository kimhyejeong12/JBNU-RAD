"""질의 도구 — 연습용 로그 · 시험 DB 로 도구마다 결과 · 바로잡기 · 감사 기록을 봅니다 (모델 없이)."""
from __future__ import annotations

import json
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
