"""질의 에이전트 — 정해진 도구 호출을 내는 가짜 모델로 루프 · 한도 · 도구 오류 · 대화 이어 가기 · 검증을 봅니다."""
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


def test_tool_then_answer(sources, people):
    count = len(search(load_events(LOG).records, user="재무 정다은", how="출력"))
    model = FakeModel([call("find_logs", {"keyword": "재무 정다은", "how": "출력"}),
                       AIMessage(f"**재무 정다은**은 출력을 {count}번 했습니다.")])
    out = Agent(model, sources).ask("재무 정다은이 출력을 몇 번 했어?", user=people["manager"])
    assert not out["failed"] and out["answer"] == f"재무 정다은은 출력을 {count}번 했습니다." and out["checks"] == []
    assert [s["tool"] for s in out["steps"]] == ["find_logs"] and out["steps"][0]["criteria"]["user"] == "재무 정다은"
    assert {t["function"]["name"] for t in model.tools} == {"search_regulations", "find_logs", "servers", "person", "findings", "query"}
    system, *_, tool_msg = model.calls[1]
    assert isinstance(system, SystemMessage) and "재무 정다은" in system.content and isinstance(tool_msg, ToolMessage)


def test_bad_tool_and_args_go_back_to_model(sources):
    model = FakeModel([call("nope", {}), call("findings", {"kind": "없는종류"}, "c2"), AIMessage("모르겠습니다.")])
    out = Agent(model, sources).ask("뭐?")
    assert [s["summary"] for s in out["steps"]] == ["실패", "실패"]
    assert "모르는 도구" in out["steps"][0]["error"] and "인자 오류" in out["steps"][1]["error"]
    assert out["answer"] == "모르겠습니다." and not out["failed"]


def test_step_limit_forces_final_answer(sources):
    model = FakeModel([call("search_regulations", {"query": "급여"}, f"c{i}") for i in range(2)] + [AIMessage("3.3 에 따릅니다.")])
    out = Agent(model, sources, max_steps=2).ask("급여 기준?")
    assert len(out["steps"]) == 2 and out["answer"] == "3.3 에 따릅니다." and out["sources"] == ["접근권한_관리기준.md"]
    assert isinstance(model.calls[-1][-1], HumanMessage) and "더 부르지 말고" in model.calls[-1][-1].content


def test_history_and_checks(sources):
    model = FakeModel([call("search_regulations", {"query": "근무 시간"}),
                       AIMessage("<think>음</think>그중 99건이고 보안_규정.md 를 따릅니다.")])
    history = [{"question": f"q{i}", "answer": f"a{i}", "steps": [{"tool": "find_logs", "summary": "로그 3건"}]} for i in range(6)]
    history += [{"question": "근거 없음", "answer": "지어냄", "steps": []}, {"question": "실패", "answer": "", "steps": [{"tool": "x", "summary": "실패"}], "failed": True}]
    out = Agent(model, sources).ask("그중 근무 시간 밖은?", history=history)
    msgs = model.calls[0]
    assert [m.content.split("\n")[0] for m in msgs if isinstance(m, HumanMessage)] == ["q2", "q3", "q4", "q5", "그중 근무 시간 밖은?"]
    assert msgs[1].content == "q2\n(앞서 찾은 것: 로그 3건)" and msgs[2].content == "a2"
    assert out["answer"].startswith("그중 99건") and len(out["checks"]) == 2


def test_empty_answer_fails(sources):
    out = Agent(FakeModel([AIMessage(""), AIMessage("")]), sources).ask("?")
    assert out["failed"] and out["error"].startswith("모델이 빈 답을 냈습니다")


def test_answer_without_tool_restarts_from_scratch(sources):
    model = FakeModel([AIMessage("지어낸 답"), call("search_regulations", {"query": "급여"}), AIMessage("3.3 에 따릅니다.")])
    out = Agent(model, sources).ask("급여 기준?")
    assert out["restarts"] == 1 and out["answer"] == "3.3 에 따릅니다." and out["checks"] == []
    retry = model.calls[1]
    assert not any(isinstance(m, AIMessage) for m in retry) and "반드시 도구를" in retry[-1].content
    stubborn = Agent(FakeModel([AIMessage("지어낸 답"), AIMessage("또 지어낸 답")]), sources).ask("?")
    assert stubborn["restarts"] == 1 and stubborn["answer"] == "또 지어낸 답" and stubborn["checks"][0] == "도구로 찾지 않고 답했습니다"


def test_check_and_clean():
    assert check("10월 20일 3.3 조항, 48건", "?", ["2026-10-20T09:00 … 3.3 … \"count\": 48"]) == []
    assert check("7건", "7건 맞아?", []) == []
    assert clean("## 제목\n**굵게**") == "제목\n굵게"
    assert clean("17건입니다.\n\n[그때 찾은 것] find_logs: 17건") == "17건입니다."
