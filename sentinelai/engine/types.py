from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, Field

RiskLevel = Literal["정상", "주의", "위험"]


class Answer(BaseModel):
    """근거 문서를 인용한 질의응답 결과."""

    answer: str = Field(description="질문에 대한 한국어 답변")
    sources: list[str] = Field(description="인용한 근거 문서 식별자. 없으면 빈 목록")


class Verdict(BaseModel):
    """접근 권한 신청 한 건에 대한 판단."""

    level: RiskLevel = Field(description="위험 등급")
    reason: str = Field(description="그렇게 판단한 이유")
    sources: list[str] = Field(description="근거로 삼은 기준 문서 식별자 목록")
    recommendation: str = Field(description="개선안 또는 권고 조치")


class ServerGap(BaseModel):
    """서버의 지금 상태가 기준 문서와 다른 곳 한 군데와, 맞추려면 바꿀 것."""

    item: str = Field(description="어긋난 현황 항목 이름 또는 솔루션 정책 ID (예: 관리자 계정, FW-006)")
    current: str = Field(description="지금 상태 — 현황 값이나 정책 내용 그대로")
    required: str = Field(description="기준 문서가 요구하는 상태")
    source: str = Field(description="근거 조항 — 기준 문서 이름과 조항 번호 (예: 정책_운영기준.md 6.2)")
    level: RiskLevel = Field(description="이 차이의 위험 등급")
    change: str = Field(description="기준에 맞추려면 이 환경에서 바꿀 것 — 설정 · 정책 · 계정 등 구체적 조치")


class ServerReview(BaseModel):
    """서버 한 대의 현황을 기준 문서와 비교한 결과."""

    level: RiskLevel = Field(description="서버 전체 위험 등급 — 차이가 없으면 정상")
    gaps: list[ServerGap] = Field(description="기준 문서와 다른 곳 목록. 없으면 빈 목록")
    unjudged: list[str] = Field(description="다루는 조항이 없어 판단하지 않은 현황 항목 이름. 없으면 빈 목록")
    summary: str = Field(description="한두 문장 요약")


class LogFilter(BaseModel):
    """로그 질의에서 뽑은 조건. 언급되지 않은 조건은 빈 문자열입니다."""

    user: str = Field("", description="사용자 이름 · ID (예: 홍길동)")
    department: str = Field("", description="부서 (예: 재무)")
    solution: str = Field("", description="보안 솔루션 (예: SecureMark)")
    where: str = Field("", description="행위 위치 (예: VDI)")
    how: str = Field("", description="행위 유형 (예: 출력행위)")
    keyword: str = Field("", description="솔루션 고유 항목 조건. 항목=값 (예: Exception=1) 또는 찾을 말 (예: pptx)")
    since: str = Field("", description="이 시각 이후, ISO 8601 UTC (예: 2026-10-05T00:00:00Z)")
    until: str = Field("", description="이 시각까지, ISO 8601 UTC")


class ServerFilter(BaseModel):
    """서버 질의에서 뽑은 조건. 언급되지 않은 조건은 빈 문자열입니다."""

    nodes: str = Field("", description="노드 이름. 여럿이면 쉼표로 (예: web-01, db-02). 모든 서버면 빈 문자열")
    module: str = Field("", description="모듈 하나 (UFW · SSH · PAM · 계정 · sudo 중). 모든 모듈이면 빈 문자열")
    since: str = Field("", description="이 시각 이후, ISO 8601 UTC (예: 2026-10-05T00:00:00Z)")
    until: str = Field("", description="이 시각까지, ISO 8601 UTC")


class SuspectScore(BaseModel):
    """사용자 한 명의 의심 점수 — 앞으로 보안 위협이 될 가능성. 판정이 아니라 먼저 살펴볼 사람을 고르는 예측입니다."""

    score: int = Field(ge=0, le=100, description="의심 점수 0~100. 높을수록 위협 가능성이 크다")
    reason: str = Field(description="그 점수가 나온 이유 — 어떤 행동 신호 · 기록 때문인지")
    watch: str = Field(description="보안 운영자가 확인할 점")


class PolicyIssue(BaseModel):
    """정책 목록에서 발견된 문제 한 건."""

    kind: Literal["중복", "충돌", "과도한 허용"] = Field(description="문제 유형")
    level: RiskLevel = Field(description="위험 등급")
    policy_ids: list[str] = Field(description="관련 정책 ID")
    reason: str = Field(description="문제라고 본 이유")
    recommendation: str = Field(description="개선안")


class PolicyReview(BaseModel):
    """정책 검토 결과 전체."""

    issues: list[PolicyIssue] = Field(description="발견된 문제 목록. 없으면 빈 목록")
    summary: str = Field(description="검토 요약")


class Notifier(Protocol):
    """로그 감시의 주의 · 위험을 운영자에게 알리는 자리 — 아직 구현하지 않았습니다 (CLAUDE.md §8).

    내보내는 곳(메일 · 메신저 등)은 이 인터페이스를 구현해 붙이고, 부를 곳은 pipeline.monitor 입니다.
    """

    def send(self, subject: str, verdict: Verdict, evidence: str) -> None:
        """subject: 대상 사용자, evidence: 판정에 쓴 로그 (한 줄에 한 건)."""
        ...

