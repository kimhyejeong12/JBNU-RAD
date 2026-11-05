"""사람 맥락 — 계정 · 이동 · 지금 가진 권한 · 신청 기록 · 로그 요약 · 행동 신호 · 위협 기록. 사람이 정한 것만 담습니다."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from ..db import Database, auth, decisions, permissions, results
from ..sources import SecurityEvent, behavior_signals, group_by_user, parse_datetime, signals_text, summarize, threat_lines
from ..sources.logs import THREAT_LIMIT
from .budget import Section

# 예전 AI 등급 · 의심 점수는 넣지 않습니다 — 한 번 위험으로 찍힌 사람이 계속 위험으로 나오지 않게.
DECIDED = {"act": "조치 필요", "clear": "이상 없음"}
NO_ACCOUNT = "- SentinelAI 계정과 잇지 않은 로그 사용자 — 계정 기록 없음 (의심 근거 아님)"


def move_text(move: dict[str, Any]) -> str:
    side = lambda d, j: f"{d or '부서 없음'}({j or '직무 없음'})"  # noqa: E731
    return f"{move['moved_on']} {side(move['from_department'], move['from_job'])} → {side(move['to_department'], move['to_job'])}"


def grant_text(g: dict[str, Any]) -> str:
    """권한 목록의 시스템 · 분류 · 설명까지 붙입니다."""
    name = f"{g['requested_access']} ({g['access_code']})" if g.get("access_code") else g["requested_access"]
    where = " / ".join(x for x in (g.get("system"), g.get("category")) if x)
    return (f"{name}{' · ' + where if where else ''}{' — ' + g['description'] if g.get('description') else ''}"
            f" · {g['period_end'] + '까지' if g.get('period_end') else '기간 없음'}")


@dataclass
class Person:
    account: dict[str, Any] | None
    log_id: str
    events: list[SecurityEvent]
    signals: dict[str, Any] | None
    decided: list[str]

    def account_lines(self) -> list[str]:
        a = self.account
        if not a:
            return [NO_ACCOUNT]
        return [f"- 계정: {a['department'] or '부서 없음'} · 직무 {a['job'] or '적지 않음'} · {'정지' if not a['is_active'] else '활성'}"
                f" · 만든 날 {a['created_at'][:10]}" + (f" · 퇴사일 {a['left_on']}" if a["left_on"] else "")]

    def held_lines(self) -> list[str]:
        if not self.account:
            return []
        held = self.account["held"]
        return ["- 지금 가진 권한:" + ("" if held else " 없음"), *(f"  - {grant_text(g)}" for g in held)]

    def short(self, key: str = "person") -> list[Section]:
        """빠른 감시용 — 계정 · 지금 가진 권한만."""
        return [Section(key, self.account_lines() + self.held_lines())]

    def full(self, key: str = "person", held: bool = True, signals: bool = True, skip: list[SecurityEvent] | None = None) -> list[Section]:
        """신청 기록 · 위협 기록은 예산이 모자라면 오래된 것부터 뺍니다. skip = 위협 기록에서 뺄 로그(지금 판정하는 묶음)."""
        out = [Section(key, self.account_lines())]
        a = self.account
        if a:
            out.append(Section(key, [f"- 이동: {move_text(m)}" for m in a["moves"]]))
            if held:
                out.append(Section(key, self.held_lines()))
            reqs = a["requests"]
            if reqs:
                counts = {k: sum(r["stage"] == k for r in reqs) for k in ("승인", "반려", "회수", "철회")}
                out.append(Section(key, [f"- 권한 신청 {len(reqs)}건 (" + ", ".join(f"{k} {v}" for k, v in counts.items() if v) + ")"]))
                out.append(Section(key, [self._request_line(r) for r in reversed(reqs)], trim=0))
            else:
                out.append(Section(key, ["- 권한 신청 없음"]))
        out.append(Section(key, [self._log_line()]))
        if signals and self.signals:
            out.append(Section(key, ["- 행동 신호 (최근 7일 vs 앞 4주):", *("  " + x for x in signals_text(self.signals).splitlines())]))
        out.append(Section(key, ["- 최근 위협 기록 (운영자가 정한 것 · 코드가 고른 로그 — 예외 승인 · 민감 문서 · 근무 시간 밖):"]))
        lines = self.decided[-THREAT_LIMIT:]
        judged = {id(e) for e in skip or []}
        lines += threat_lines([e for e in self.events if id(e) not in judged], THREAT_LIMIT - len(lines))
        out.append(Section(key, [f"  {x}" for x in lines] or ["  - 없음"], trim=2))
        return out

    @staticmethod
    def _request_line(r: dict[str, Any]) -> str:
        line = f"  - {r['at'][:10]} {r['access']} — {r['stage']}"
        if r["rejected_by"]:
            line += f" ({r['rejected_by']} 반려: {(r['comment'] or '의견 없음')[:120]})"
        if r["revoke_reason"]:
            line += f" (회수 사유: {r['revoke_reason'][:120]})"
        return line + f" · 사유: {(r['reason'] or '없음')[:100]}"

    def _log_line(self) -> str:
        if self.events:
            facts = summarize(self.events)
            top = lambda d: ", ".join(f"{k} {v}" for k, v in list(d.items())[:3])  # noqa: E731
            return (f"- 로그 {facts['count']}건 ({facts['first'][:10]} ~ {facts['last'][:10]}) · 솔루션 {top(facts['by_solution'])}"
                    f" · 행위 {top(facts['by_how'])}")
        if self.log_id:
            return "- 로그 없음"
        return "- 로그 사용자 ID 를 아직 적지 않아 로그를 잇지 못함 (의심 근거 아님)"


class People:
    """작업 한 번에 쓸 사람 자료 — 로그 · 계정 · 운영자 결정은 한 번만 읽습니다."""

    def __init__(self, main_db: Database, results_db: Database, events: list[SecurityEvent], now: datetime | None = None) -> None:
        self.main_db = main_db
        self.now = now or datetime.now(timezone.utc)
        self.events = events
        self.by_log = group_by_user(events)
        self.accounts = auth.accounts_brief(main_db)
        self.signals = behavior_signals(events, self.now)
        # 운영자가 로그 감시 판정에 정한 것 — 로그 사용자 ID → (결정 시각, 글)
        found = {k: d for k, d in decisions.current(main_db, "event").items() if d["action"] in DECIDED}
        owners = results.finding_users(results_db, [int(k.split("/")[1]) for k in found if k.startswith("event_findings/")])
        self.decided: dict[str, list[tuple[str, str]]] = {}
        for k, d in found.items():
            if k.startswith("event_findings/") and (o := owners.get(int(k.split("/")[1]))):
                text = (f"- {o['at'][:16].replace('T', ' ')} UTC 로그 감시 묶음 — {d['decider_name']}이(가) {DECIDED[d['action']]}로 정함"
                        + (f": {d['comment'][:100]}" if d["comment"] else ""))
                self.decided.setdefault(o["log_id"], []).append((d["decided_at"], text))

    def account_of(self, log_id: str) -> int | None:
        return next((a["id"] for a in self.accounts if log_id and a["log_id"] == log_id), None)

    def get(self, account_id: int | None = None, log_id: str = "", before: str | None = None) -> Person:
        """before 가 있으면 그때까지의 이동 · 신청 · 로그 · 결정만 봅니다 (신청 판정)."""
        if account_id is None and log_id:
            account_id = self.account_of(log_id)
        account = permissions.account_record(self.main_db, account_id, before) if account_id is not None else None
        log_id = log_id or (account or {}).get("log_id") or ""
        mine = self.by_log.get(log_id, []) if log_id else []
        signals = self.signals.get(log_id) if log_id else None
        decided = self.decided.get(log_id, [])
        if before:
            cut = parse_datetime(before)
            mine = [e for e in mine if e.occurred_at <= cut]
            signals = behavior_signals(mine, cut).get(log_id) if mine else None
            decided = [d for d in decided if d[0] <= before]
        return Person(account, log_id, mine, signals, [text for _, text in sorted(decided)])

    def suspects(self, findings: list[dict[str, Any]], requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """위협 예측 대상 — 계정과 로그 사용자는 log_id 로 잇고, 잇지 못한 로그 사용자는 "계정 미연결"로 둡니다."""
        people: dict[str, dict[str, Any]] = {}
        by_log: dict[str, str] = {}
        by_account: dict[int, str] = {}

        def person(key: str, **info: Any) -> dict[str, Any]:
            return people.setdefault(key, {"key": key, **info, "signals": None, "findings": [], "requests": []})

        # 일반 사용자와 로그 사용자 ID 를 적은 계정만 사람으로 둡니다.
        for a in self.accounts:
            if a["role"] != "user" and not a["log_id"]:
                continue
            key = f"account:{a['id']}"
            person(key, name=a["display_name"], department=a["department"], login_id=a["login_id"], log_id=a["log_id"],
                   linked=bool(a["log_id"]), account_id=a["id"])
            by_account[a["id"]] = key
            if a["log_id"]:
                by_log[a["log_id"]] = key
        for log_id, s in self.signals.items():
            key = by_log.get(log_id) or f"log:{log_id}"
            person(key, name=s["subject"], department="", login_id=None, log_id=log_id, linked=False, account_id=None)["signals"] = s
        # 아래 둘은 화면의 기록 칸(로그 위험 · 주의 수 등)에만 쓰고 모델에는 넣지 않습니다.
        for f in findings:
            key = by_log.get(f["log_id"]) or f"log:{f['log_id']}"
            person(key, name=f["subject"], department="", login_id=None, log_id=f["log_id"], linked=False, account_id=None)["findings"].append(f)
        for r in requests:
            if r["account_id"] in by_account:
                people[by_account[r["account_id"]]]["requests"].append(r)
        return list(people.values())
