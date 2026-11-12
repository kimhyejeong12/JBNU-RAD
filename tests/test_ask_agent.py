"""질의 에이전트 — 정해진 답을 내는 가짜 모델로 단계 순서 · 한도 · 도구 오류 · 골라내기 · 대화 이어 가기 · 검증을 봅니다."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from langchain_core.documents import Document
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from sentinelai.ask import Agent, check, clean
from sentinelai.sources import Sources, load_events, search

LOG = "data/연습용_로그_원본+합성.csv"


class FakeDocs:
    def search(self, query: str, k: int | None = None) -> list[Document]:
        return [Document(page_content="### 3.3 급여 정보 접근\n인사팀장의 사전 승인을 필수로 한다.", metadata={"source": "접근권한_관리기준.md"})]


class FakeModel:
    """replies 를 차례로 내고, 받은 메시지를 calls 에 남깁니다."""

    def __init__(self, replies: list[AIMessage]) -> None:
        self.replies = list(replies)
        self.calls: list[list] = []
        self.tools: list[dict] = []

    def bind_tools(self, tools: list[dict]) -> FakeModel:
        self.tools = tools
        return self

    def invoke(self, messages: list) -> AIMessage:
        self.calls.append(list(messages))
        return self.replies.pop(0)


def call(name: str, args: dict, id: str = "c1") -> AIMessage:
    return AIMessage("", tool_calls=[{"name": name, "args": args, "id": id}])


@pytest.fixture
def sources(main_db, results_db):
    return Sources(SimpleNamespace(events_source=LOG), main_db, results_db, FakeDocs())


PLAN = AIMessage("목표: 재무 정다은의 출력 건수\n기준: 출력 행위\n자료: find_logs user=재무 정다은 how=출력\n답 모양: 숫자")
DONE = AIMessage("다 모았습니다")


def test_stages_plan_query_spot_judge(sources, people):
    count = len(search(load_events(LOG).records, user="재무 정다은", how="출력"))
    model = FakeModel([PLAN, call("find_logs", {"keyword": "재무 정다은", "how": "출력"}), DONE,
                       AIMessage("<think>x</think>T1-3: 출력 건수\nT9-9: 없는 줄"), AIMessage(f"**재무 정다은**은 출력을 {count}번 했습니다.")])
    out = Agent(model, sources).ask("재무 정다은이 출력을 몇 번 했어?", user=people["manager"])
    assert not out["failed"] and out["answer"] == f"재무 정다은은 출력을 {count}번 했습니다." and out["checks"] == []
    assert [s["tool"] for s in out["steps"]] == ["find_logs"] and out["steps"][0]["criteria"]["user"] == "재무 정다은"
    assert {t["function"]["name"] for t in model.tools} == {"search_regulations", "find_logs", "servers", "person", "findings", "query"}
    stages = out["stages"]
    assert stages["plan"]["goal"] == "재무 정다은의 출력 건수" and stages["plan"]["form"] == "숫자"
    assert [p["id"] for p in stages["spotted"]] == ["T1-3"] and stages["spotted"][0]["why"] == "출력 건수" and not stages["fallback"]
    assert set(stages["times"]) == {"plan", "query", "spot", "judge"}
    plan_call, query_call, spot_call, judge_call = model.calls[0], model.calls[1], model.calls[3], model.calls[4]
    assert "계획만 세우십시오" in plan_call[-1].content
    assert isinstance(query_call[0], SystemMessage) and "재무 정다은의 출력 건수" in query_call[0].content and "재무 정다은" in query_call[0].content
    assert "T1-1 | [조건]" in spot_call[-1].content
    judged = judge_call[-1].content
    assert f'"count": {count}' in judged and f"[find_logs — 로그 {count}건, 조건 user 재무 정다은, how 출력]" in judged
    assert "[로그 —" not in judged


def test_bad_tool_and_args_go_back_to_model(sources):
    model = FakeModel([PLAN, call("nope", {}), call("findings", {"kind": "없는종류"}, "c2"), DONE, AIMessage("모르겠습니다.")])
    out = Agent(model, sources).ask("뭐?")
    assert [s["summary"] for s in out["steps"]] == ["실패", "실패"]
    assert "모르는 도구" in out["steps"][0]["error"] and "인자 오류" in out["steps"][1]["error"]
    assert out["answer"] == "모르겠습니다." and not out["failed"] and out["checks"] == ["모은 자료에서 답에 쓸 근거를 고르지 못했습니다"]


def test_step_limit_moves_on(sources):
    model = FakeModel([PLAN] + [call("search_regulations", {"query": "급여"}, f"c{i}") for i in range(2)]
                      + [AIMessage("T1-1: 조항"), AIMessage("3.3 에 따릅니다.")])
    out = Agent(model, sources, max_steps=2).ask("급여 기준?")
    assert len(out["steps"]) == 2 and out["answer"] == "3.3 에 따릅니다." and out["sources"] == ["접근권한_관리기준.md"]
    assert out["stages"]["pool"] == 4 and not model.replies


def test_spot_falls_back_to_all_lines(sources):
    model = FakeModel([PLAN, call("search_regulations", {"query": "급여"}), DONE, AIMessage("잘 모르겠음"), AIMessage("3.3 에 따릅니다.")])
    out = Agent(model, sources).ask("급여 기준?")
    assert out["stages"]["fallback"] and len(out["stages"]["spotted"]) == 2
    assert out["checks"] == ["근거를 골라내지 못해 모은 자료 전부로 판단했습니다"]
    assert "인사팀장의 사전 승인" in model.calls[-1][-1].content


def test_history_and_checks(sources):
    model = FakeModel([PLAN, call("search_regulations", {"query": "근무 시간"}), DONE, AIMessage("T1-1: 조항"),
                       AIMessage("<think>음</think>그중 99건이고 보안_규정.md 를 따릅니다.")])
    history = [{"question": f"q{i}", "answer": f"a{i}", "steps": [{"tool": "find_logs", "summary": "로그 3건"}]} for i in range(6)]
    history += [{"question": "근거 없음", "answer": "지어냄", "steps": []}, {"question": "실패", "answer": "", "steps": [{"tool": "x", "summary": "실패"}], "failed": True}]
    out = Agent(model, sources).ask("그중 근무 시간 밖은?", history=history)
    for msgs in (model.calls[0], model.calls[1], model.calls[-1]):
        assert [m.content.split("\n")[0] for m in msgs if isinstance(m, HumanMessage)][:4] == ["q2", "q3", "q4", "q5"]
    msgs = model.calls[0]
    assert msgs[1].content == "q2\n(앞서 찾은 것: 로그 3건)" and msgs[2].content == "a2"
    assert out["answer"].startswith("그중 99건") and len(out["checks"]) == 2


def test_empty_answer_fails(sources):
    out = Agent(FakeModel([AIMessage("")] * 4), sources).ask("?")
    assert out["failed"] and out["error"].startswith("모델이 빈 답을 냈습니다") and "plan" in out["stages"]


def test_query_without_tool_restarts_from_scratch(sources):
    model = FakeModel([PLAN, AIMessage("지어낸 답"), call("search_regulations", {"query": "급여"}), DONE,
                       AIMessage("T1-1: 근거"), AIMessage("3.3 에 따릅니다.")])
    out = Agent(model, sources).ask("급여 기준?")
    assert out["restarts"] == 1 and out["answer"] == "3.3 에 따릅니다." and out["checks"] == []
    retry = model.calls[2]
    assert not any(isinstance(m, AIMessage) for m in retry) and "반드시 도구를" in retry[-1].content
    stubborn = Agent(FakeModel([PLAN, AIMessage("지어낸 답"), AIMessage("또 지어낸 답"), AIMessage("모릅니다")]), sources).ask("?")
    assert stubborn["restarts"] == 1 and stubborn["answer"] == "모릅니다" and stubborn["checks"][0] == "도구로 찾지 않고 답했습니다"


def test_check_and_clean():
    assert check("10월 20일 3.3 조항, 48건", "?", ["2026-10-20T09:00 … 3.3 … \"count\": 48"]) == []
    assert check("7건", "7건 맞아?", []) == []
    assert clean("## 제목\n**굵게**") == "제목\n굵게"
    assert clean("17건입니다.\n\n[그때 찾은 것] find_logs: 17건") == "17건입니다."


def test_code_searches_regulations_when_plan_needs_them(sources):
    plan = AIMessage("목표: 급여 권한 신청이 기준에 맞는지\n기준: 기준 문서에서 찾음\n자료: query dataset=requests\n답 모양: 설명")
    model = FakeModel([plan, call("query", {"dataset": "catalog"}), DONE, AIMessage("T2-1: 조항"), AIMessage("3.3 에 따릅니다.")])
    out = Agent(model, sources).ask("급여 권한 신청이 기준에 맞아?")
    assert [(s["tool"], s.get("by")) for s in out["steps"]] == [("query", None), ("search_regulations", "code")]
    assert out["steps"][1]["criteria"] == {"query": "급여 권한 신청이 기준에 맞는지"} and out["checks"] == []


def test_spot_always_keeps_counts(sources, people):
    model = FakeModel([PLAN, call("find_logs", {"user": "재무 정다은"}), DONE, AIMessage("T1-6: 로그 한 줄"), AIMessage("확인했습니다.")])
    out = Agent(model, sources).ask("재무 정다은 로그 보여 줘", user=people["manager"])
    assert [(p["id"], p["why"]) for p in out["stages"]["spotted"]] == [("T1-3", "집계 (코드가 넣음)"), ("T1-6", "로그 한 줄")]
