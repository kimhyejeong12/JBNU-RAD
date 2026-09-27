"""Engine 판정 결과를 화면용 dict 로 옮기는 어댑터.

Verdict · PolicyReview 필드는 그대로 두고 title · verdict · detail · elapsed_sec 만 덧붙입니다.
판정이 실패하면 최대 2회 재시도하고, 그래도 실패하면 예외 대신 "주의" 로 기록합니다.
"""
from __future__ import annotations

import time
from typing import Any

from rad_lmengine import PolicyReview, Verdict

from .loader import format_policies, review_input

VERDICT_LABEL = {"정상": "승인 권고", "주의": "추가 검토", "위험": "반려 권고"}
RETRIES = 2


def _attempt(call) -> tuple[Any | None, str | None, float]:
    """call() 을 최대 RETRIES+1 회 시도합니다. → (결과 또는 None, 마지막 실패 원인, 소요 초)"""
    started = time.time()
    error = None
    for _ in range(RETRIES + 1):
        try:
            return call(), None, time.time() - started
        except Exception as exc:  # 구조화 출력 파싱 실패 · 연결 오류 모두 재시도합니다.
            error = f"{type(exc).__name__}: {exc}"
    return None, error, time.time() - started


def review_permission(chain, row: dict[str, str]) -> tuple[dict[str, Any], str | None]:
    """권한 신청 1건 → (화면용 dict, 실패 원인 또는 None)"""
    verdict, error, elapsed = _attempt(lambda: chain.invoke(review_input(row)))
    if verdict is None:
        verdict = Verdict(
            level="주의",
            reason=f"판정 실패: {error}",
            sources=[],
            recommendation="모델 출력 파싱이 실패했습니다. 수동 검토가 필요합니다.",
        )
    return {
        "id": row["id"],
        "title": f"{row['requester']} → {row['requested_access']}",
        "level": verdict.level,
        "verdict": VERDICT_LABEL[verdict.level],
        "reason": verdict.reason,
        "sources": verdict.sources,
        "recommendation": verdict.recommendation,
        "detail": {k: v for k, v in row.items() if k != "id"},
        "elapsed_sec": round(elapsed, 1),
    }, error


def review_policies(chain, rows: list[dict[str, str]]) -> tuple[dict[str, Any], str | None]:
    """정책 목록 전체 → (화면용 dict, 실패 원인 또는 None)"""
    policies = format_policies(rows)
    review, error, elapsed = _attempt(lambda: chain.invoke({"policies": policies}))
    if review is None:
        review = PolicyReview(issues=[], summary=f"판정 실패: {error}")
    return {
        "summary": review.summary,
        "issues": [issue.model_dump() for issue in review.issues],
        "elapsed_sec": round(elapsed, 1),
    }, error
