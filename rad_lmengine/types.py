from __future__ import annotations

from typing import Literal

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
