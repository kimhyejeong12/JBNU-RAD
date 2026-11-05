"""사람 칸 — sources.Person 을 계정 · 이동 · 지금 가진 권한 · 신청 기록 · 로그 요약 · 행동 신호 · 위협 기록 글로 씁니다."""
from __future__ import annotations

from typing import Any

from ..sources import Person, SecurityEvent, move_text, signals_text, summarize, threat_lines
from .budget import COMMENT_CHARS, REVIEW_CHARS, THREAT_LINES, Section

DECIDED = {"act": "조치 필요", "clear": "이상 없음"}
NO_ACCOUNT = "- SentinelAI 계정과 잇지 않은 로그 사용자 — 계정 기록 없음 (의심 근거 아님)"


def grant_text(g: dict[str, Any]) -> str:
    """권한 목록의 시스템 · 분류 · 설명까지 붙입니다."""
    name = f"{g['requested_access']} ({g['access_code']})" if g.get("access_code") else g["requested_access"]
    where = " / ".join(x for x in (g.get("system"), g.get("category")) if x)
    return (f"{name}{' · ' + where if where else ''}{' — ' + g['description'] if g.get('description') else ''}"
            f" · {g['period_end'] + '까지' if g.get('period_end') else '기간 없음'}")


def account_lines(p: Person) -> list[str]:
    a = p.account
    if not a:
        return [NO_ACCOUNT]
    return [f"- 계정: {a['department'] or '부서 없음'} · 직무 {a['job'] or '적지 않음'} · {'정지' if not a['is_active'] else '활성'}"
            f" · 만든 날 {a['created_at'][:10]}" + (f" · 퇴사일 {a['left_on']}" if a["left_on"] else "")]


def held_lines(p: Person) -> list[str]:
    if not p.account:
        return []
    held = p.account["held"]
    return ["- 지금 가진 권한:" + ("" if held else " 없음"), *(f"  - {grant_text(g)}" for g in held)]


def decided_line(d: dict[str, Any]) -> str:
    return (f"- {d['at'][:16].replace('T', ' ')} UTC 로그 감시 묶음 — {d['decider_name']}이(가) {DECIDED[d['action']]}로 정함"
            + (f": {d['comment'][:COMMENT_CHARS]}" if d["comment"] else ""))


def request_line(r: dict[str, Any]) -> str:
    line = f"  - {r['at'][:10]} {r['access']} — {r['stage']}"
    if r["rejected_by"]:
        line += f" ({r['rejected_by']} 반려: {(r['comment'] or '의견 없음')[:REVIEW_CHARS]})"
    if r["revoke_reason"]:
        line += f" (회수 사유: {r['revoke_reason'][:REVIEW_CHARS]})"
    return line + f" · 사유: {(r['reason'] or '없음')[:COMMENT_CHARS]}"


def log_line(p: Person) -> str:
    if p.events:
        facts = summarize(p.events)
        top = lambda d: ", ".join(f"{k} {v}" for k, v in list(d.items())[:3])  # noqa: E731
        return (f"- 로그 {facts['count']}건 ({facts['first'][:10]} ~ {facts['last'][:10]}) · 솔루션 {top(facts['by_solution'])}"
                f" · 행위 {top(facts['by_how'])}")
    if p.log_id:
        return "- 로그 없음"
    return "- 로그 사용자 ID 를 아직 적지 않아 로그를 잇지 못함 (의심 근거 아님)"


def short(p: Person, key: str = "person") -> list[Section]:
    """빠른 감시용 — 계정 · 지금 가진 권한만."""
    return [Section(key, account_lines(p) + held_lines(p))]


def full(p: Person, key: str = "person", held: bool = True, signals: bool = True, skip: list[SecurityEvent] | None = None) -> list[Section]:
    """신청 기록 · 위협 기록은 자를 수 있는 칸입니다 (budget.TRIM). skip = 위협 기록에서 뺄 로그(지금 판정하는 묶음)."""
    out = [Section(key, account_lines(p))]
    a = p.account
    if a:
        out.append(Section(key, [f"- 이동: {move_text(m)}" for m in a["moves"]]))
        if held:
            out.append(Section(key, held_lines(p)))
        reqs = a["requests"]
        if reqs:
            counts = {k: sum(r["stage"] == k for r in reqs) for k in ("승인", "반려", "회수", "철회")}
            out.append(Section(key, [f"- 권한 신청 {len(reqs)}건 (" + ", ".join(f"{k} {v}" for k, v in counts.items() if v) + ")"]))
            out.append(Section(key, [request_line(r) for r in reversed(reqs)], cut="requests"))
        else:
            out.append(Section(key, ["- 권한 신청 없음"]))
    out.append(Section(key, [log_line(p)]))
    if signals and p.signals:
        out.append(Section(key, ["- 행동 신호 (최근 7일 vs 앞 4주):", *("  " + x for x in signals_text(p.signals).splitlines())]))
    out.append(Section(key, ["- 최근 위협 기록 (운영자가 정한 것 · 코드가 고른 로그 — 예외 승인 · 민감 문서 · 근무 시간 밖):"]))
    lines = [decided_line(d) for d in p.decided if d["action"] in DECIDED][-THREAT_LINES:]
    judged = {id(e) for e in skip or []}
    lines += threat_lines([e for e in p.events if id(e) not in judged], THREAT_LINES - len(lines))
    out.append(Section(key, [f"  {x}" for x in lines] or ["  - 없음"], cut="threats"))
    return out
