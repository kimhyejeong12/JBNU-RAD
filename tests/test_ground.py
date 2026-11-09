"""판정 근거 조항 확인 (가짜 모델)."""
from __future__ import annotations

from types import SimpleNamespace

from langchain_core.runnables import RunnableLambda

from sentinelai.context import Inputs, Section, fit
from sentinelai.engine.ground import ground
from sentinelai.engine.worker import Verdict, Worker
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
def _worker(first: Verdict):
    seen: dict[str, dict] = {}

    def chain(prompt, schema, think):
        return RunnableLambda(lambda inputs: seen.setdefault("first", inputs) and first)

    settings = SimpleNamespace(model="m", num_ctx=16384, num_predict=4096)
    res = SimpleNamespace(settings=settings, inputs=Inputs(settings), chain=chain,
                          sources=SimpleNamespace(regulations=SimpleNamespace(for_request=lambda row: CLAUSES)))
    return Worker(res, None), seen


def _verdict(level: str, sources: tuple[str, ...] = ("접근권한_관리기준.md 3.3",)) -> Verdict:
    return Verdict(level=level, reason="이유", sources=list(sources), recommendation="권고")


def test_judge_grounds_sources():
    worker, seen = _worker(_verdict("위험", ("접근권한_관리기준.md 3.3", "접근권한_관리기준.md 9.9")))
    out = worker.judge("request", {"row": ROW, "person": PERSON})
    assert seen["first"]["requester"].startswith("영업팀 김철수") and seen["first"]["context"] == CLAUSES
    assert out["level"] == "위험" and out["grounding"] == {"checks": ["판정: 입력에 없는 조항 접근권한_관리기준.md 9.9"]}
