"""선례 검토 입력 — 판사 모델에 줄 사례(1차 판정이 본 대상 칸) · 1차 판정 · 선례를 글로 씁니다. 크기는 여기서 자릅니다."""
from __future__ import annotations

from typing import Any

from .budget import COMMENT_CHARS, REVIEW_CHARS
from .builders import POLICY_DECIDED
from .person import DECIDED

# 판사 입력 · 다시 판정 입력에 넣는 글자 수입니다 (다시 판정 몫은 판정 입력 예산에서 미리 뺍니다).
PRECEDENT_CHARS = 1800
VERDICT_CHARS = 1200
CASE_CHARS = 3500
REVIEW_TEXT_CHARS = 800
RESERVE = PRECEDENT_CHARS + VERDICT_CHARS + REVIEW_TEXT_CHARS
# 판정마다 판사에게 보여 줄 사례 칸 — (제목, 판정 입력 칸 이름).
CASE_KEYS = {
    "request": (("신청자", "requester"), ("신청 권한", "requested_access"), ("신청 사유", "reason"), ("사용 기간", "period"),
                ("현재 보유 권한", "current_access")),
    "grant": (("보유자", "requester"), ("부서 · 직무 이동", "move"), ("보유 권한", "requested_access"),
              ("받을 때의 신청 사유", "reason"), ("사용 기간", "period")),
    "events": (("대상 사용자", "subject"), ("보안 솔루션 로그", "events")),
    "nodes": (("대상 서버", "subject"), ("서버 상태", "state")),
    "policies": (),
}


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + " …(입력 한도로 뒤를 뺐습니다)"


def _said(label: str, comment: str) -> str:
    return label + (f" — 의견: {comment[:COMMENT_CHARS]}" if comment else "")


def precedent_lines(found: list[dict[str, Any]]) -> list[str]:
    """선례마다 [P번호] 한 줄 (로그 감시는 로그 몇 줄을 들여 씀) — 크기를 넘는 뒤 선례는 뺍니다."""
    out: list[str] = []
    size = 0
    for n, p in enumerate(found, 1):
        if p["kind"] == "request":
            lines = [f"[P{n}] {p['department'] or '부서 없음'} ({p['job'] or '직무 없음'}) — {p['access']} "
                     f"[{p['code'] or '코드 없음'}, {p['category'] or '분류 없음'}] 사유: {p['reason'] or '적지 않음'}, "
                     f"사용 기간 끝 {p['period_end'] or '없음'} → {_said(p['decision'], p['comment'])}"]
        elif p["kind"] == "event":
            lines = [f"[P{n}] {p['subject']} → {_said(DECIDED[p['decision']], p['comment'])}", *(f"    {e}" for e in p["events"])]
        elif p["kind"] == "server":
            lines = [f"[P{n}] {p['node']} — 정책과 다른 곳: {', '.join(p['items']) or '없음'} → {_said(DECIDED[p['decision']], p['comment'])}"]
        else:
            lines = [f"[P{n}] {p['issue']} ({', '.join(p['policy_ids'])}) {p['reason'][:REVIEW_CHARS]} → "
                     f"{_said(POLICY_DECIDED[p['decision']], p['comment'])}"]
        size += sum(len(x) + 1 for x in lines)
        if size > PRECEDENT_CHARS and out:
            break
        out += lines
    return out


def verdict_text(result: dict[str, Any]) -> str:
    """1차 판정을 글로 — 판정 · 서버 점검 · 정책 관리 검토 모양을 모두 받습니다."""
    if "gaps" in result:
        lines = [f"서버 등급 {result['level']} — {result.get('summary', '')}"]
        lines += [f"- {g['item']}: 지금 {g['current']} / 기준 {g['required']} ({g['source']}) {g['level']} → {g['change']}" for g in result["gaps"]]
    elif "issues" in result:
        lines = [f"요약: {result.get('summary', '')}"]
        lines += [f"- {i['kind']} {i['level']} ({', '.join(i['policy_ids'])}): {i['reason']} → {i['recommendation']}" for i in result["issues"]]
    else:
        lines = [f"등급 {result['level']}", f"이유: {result['reason']}", f"근거 조항: {', '.join(result.get('sources') or []) or '없음'}",
                 f"권고: {result['recommendation']}"]
    return _clip("\n".join(lines), VERDICT_CHARS)


def case_text(kind: str, inputs: dict[str, str]) -> str:
    parts = [f"[{title}]\n{inputs[key]}" for title, key in CASE_KEYS[kind] if inputs.get(key)]
    return _clip("\n\n".join(parts), CASE_CHARS) or "(정책 관리 검토 — 사례는 1차 판정의 문제 목록입니다)"


def review_text(review: dict[str, Any]) -> str:
    return _clip(f"어긋나는 선례: {', '.join(review['conflicts'])}\n이유: {review['reason']}\n다시 볼 점: {review['suggestion']}",
                 REVIEW_TEXT_CHARS)


__all__ = ["RESERVE", "case_text", "precedent_lines", "review_text", "verdict_text"]
