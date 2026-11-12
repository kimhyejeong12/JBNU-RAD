"""판정 근거 조항 확인 · 선례 검토 (가짜 모델)."""
from __future__ import annotations

from types import SimpleNamespace

from langchain_core.runnables import RunnableLambda

from sentinelai.context import Inputs, Section, fit
from sentinelai.engine.ground import ground
from sentinelai.engine.worker import PrecedentReview, Verdict, Worker
from sentinelai.sources import Person

CLAUSES = "[접근권한_관리기준.md] ### 3.3 급여 정보 접근\n급여 테이블 접근은 인사팀장의 사전 승인을 필수로 한다."


def test_ground_flags_clauses_missing_from_input():
    built = fit([Section("requester", ["영업팀 김철수"]), Section("context", [CLAUSES])], 1000)
    assert ground({"sources": ["접근권한_관리기준.md 3.3", "[접근권한_관리기준.md] ### 3.3 급여 정보 접근"]}, built) == {"checks": []}
    bad = ground({"sources": ["접근권한_관리기준.md 4.2", "보안_규정.md"]}, built)
    assert bad["checks"] == ["판정: 입력에 없는 조항 접근권한_관리기준.md 4.2, 보안_규정.md"]
    gaps = ground({"gaps": [{"item": "ssh", "source": "정책_운영기준.md 6.2"}, {"item": "ufw", "source": "접근권한_관리기준.md 3.3"}]}, built)
    assert gaps["checks"] == ["차이 ssh: 입력에 없는 조항 정책_운영기준.md 6.2"]


ROW = {"request_no": "REQ-20261109-001", "requester_name": "김철수", "requester_department": "영업팀", "requested_access": "급여 테이블 조회",
       "access_code": "SALARY_READ", "reason": "실적 정산"}
PERSON = Person({"department": "영업팀", "job": "", "is_active": 1, "created_at": "2026-10-01", "left_on": "", "moves": [], "requests": [],
                 "held": []}, "", [], None, [])
PRECEDENT = {"kind": "request", "department": "마케팅팀", "job": "", "access": "급여 테이블 조회", "code": "SALARY_READ", "category": "급여정보",
             "reason": "연봉 조정", "period_end": "", "decision": "1차 반려", "comment": "직무와 무관"}


def _worker(first: Verdict, judged: PrecedentReview | None = None, again: Verdict | None = None, found: list | None = None):
    seen: dict[str, dict] = {}

    def chain(prompt, schema, think):
        if schema is PrecedentReview:
            return RunnableLambda(lambda inputs: seen.setdefault("judge", inputs) and judged)
        if len(prompt.messages) == 3:
            return RunnableLambda(lambda inputs: seen.setdefault("again", inputs) and again)
        return RunnableLambda(lambda inputs: seen.setdefault("first", inputs) and first)

    settings = SimpleNamespace(model="m", num_ctx=16384, num_predict=4096)
    res = SimpleNamespace(settings=settings, inputs=Inputs(settings), chain=chain,
                          sources=SimpleNamespace(regulations=SimpleNamespace(for_request=lambda row: CLAUSES),
                                                  precedents=SimpleNamespace(for_request=lambda row: found or [])))
    return Worker(res, None), seen


def _verdict(level: str, sources: tuple[str, ...] = ("접근권한_관리기준.md 3.3",)) -> Verdict:
    return Verdict(level=level, reason="이유", sources=list(sources), recommendation="권고")


def test_judge_grounds_sources_without_precedents():
    worker, seen = _worker(_verdict("위험", ("접근권한_관리기준.md 3.3", "접근권한_관리기준.md 9.9")))
    out = worker.judge("request", {"row": ROW, "person": PERSON})
    assert seen["first"]["requester"].startswith("영업팀 김철수") and seen["first"]["context"] == CLAUSES and "judge" not in seen
    assert out["level"] == "위험" and out["grounding"] == {"checks": ["판정: 입력에 없는 조항 접근권한_관리기준.md 9.9"]}


def test_precedent_conflict_rejudges_once():
    judged = PrecedentReview(consistent=False, conflicts=["P1"], reason="마케팅팀 같은 신청을 사람이 반려", suggestion="직무 연관성")
    worker, seen = _worker(_verdict("정상"), judged, _verdict("위험"), [PRECEDENT])
    out = worker.judge("request", {"row": ROW, "person": PERSON})
    assert seen["judge"]["precedents"].startswith("[P1] 마케팅팀") and "1차 반려 — 의견: 직무와 무관" in seen["judge"]["precedents"]
    assert seen["judge"]["case"].startswith("[신청자]\n영업팀 김철수") and "등급 정상" in seen["judge"]["verdict"]
    assert "어긋나는 선례: P1" in seen["again"]["precedent_review"] and seen["again"]["requester"] == seen["first"]["requester"]
    p = out["grounding"]["precedent"]
    assert out["level"] == "위험" and p["rejudged"] and p["first"]["level"] == "정상" and p["review"]["conflicts"] == ["P1"]


def test_precedent_agree_or_unknown_conflict_keeps_first():
    agree = PrecedentReview(consistent=True, conflicts=[], reason="사실이 다름", suggestion="")
    worker, seen = _worker(_verdict("정상"), agree, None, [PRECEDENT])
    out = worker.judge("request", {"row": ROW, "person": PERSON})
    assert out["level"] == "정상" and not out["grounding"]["precedent"]["rejudged"] and "again" not in seen
    wrong = PrecedentReview(consistent=False, conflicts=["P9"], reason="?", suggestion="?")
    worker, seen = _worker(_verdict("정상"), wrong, None, [PRECEDENT])
    out = worker.judge("request", {"row": ROW, "person": PERSON})
    assert out["level"] == "정상" and "again" not in seen and any("어긋난 선례를 대지 않아" in c for c in out["grounding"]["checks"])


def test_request_precedents_are_human_decisions_ranked(main_db, results_db, people):
    from sentinelai.db import catalog, permissions
    from sentinelai.sources.precedents import Precedents
    top, manager = people["top"], people["manager"]
    catalog.create(main_db, top, "SALARY_READ", "급여 테이블 조회", "인사 시스템", "급여정보")
    catalog.create(main_db, top, "SALARY_EDIT", "급여 테이블 수정", "인사 시스템", "급여정보")
    catalog.create(main_db, top, "CRM_READ", "CRM 조회", "영업 시스템", "고객정보")
    a = permissions.submit(main_db, people["user2"], "SALARY_EDIT", reason="정산")["request_no"]
    permissions.decide(main_db, manager, a, "reject", "직무와 무관")
    b = permissions.submit(main_db, people["user"], "SALARY_READ", reason="급여 업무")["request_no"]
    permissions.decide(main_db, manager, b, "approve")
    permissions.decide(main_db, top, b, "approve", "인사팀 업무")
    permissions.submit(main_db, people["user"], "CRM_READ", reason="대기 중")
    found = Precedents(main_db, results_db).for_request({"request_no": "", "access_code": "SALARY_READ", "access_category": "급여정보",
                                                         "access_system": "인사 시스템", "requester_department": "개발팀"})
    assert [(p["code"], p["decision"], p["comment"]) for p in found] == [("SALARY_READ", "최종 승인", "인사팀 업무"),
                                                                         ("SALARY_EDIT", "1차 반려", "직무와 무관")]
    assert all("ai" not in k for p in found for k in p)
