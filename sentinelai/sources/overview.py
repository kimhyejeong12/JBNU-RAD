"""보안 현황 — 다섯 영역의 판정을 한 모양(Item)으로 모으고 열린 것 · 완료율 · 비중 · 추이 · 주요 이슈를 셉니다 (모델 없음)."""
from __future__ import annotations

import hashlib
from bisect import bisect_right
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from .decisions import policy_signature, server_signature

AREAS = {"policy": "정책 관리", "server": "서버 점검", "event": "로그 감시", "suspect": "위협 예측", "grant": "보유 권한 재검토"}
SUSPECT_LEVEL = {"높음": "위험", "보통": "주의", "낮음": "정상"}
ACTIONS = {"done": "조치 완료", "act": "조치 필요", "clear": "이상 없음", "approve": "승인", "cond": "조건부 승인",
           "reject": "반려 확정"}
CLEARED = {"clear", "reject"}
RECENT = 10   # 최근 조치만 10건 — 주요 이슈 · 판정 실패는 전부 (타일 숫자와 표 건수가 같게)
REASON_CHARS = 200


@dataclass
class Item:
    area: str
    key: str                 # 화면이 찾아갈 판정 · 사람 · 신청
    subject: str
    level: str | None        # 정상 · 주의 · 위험, 판정 실패면 None
    reason: str
    opened: str              # 판정 시각 (UTC ISO)
    ended: str | None = None  # 다음 판정에 밀리거나 회수 · 기간이 끝난 시각
    decision: str = ""       # 운영자 결정 key — 재검토는 결정 대신 회수로 끝남
    signature: tuple | None = None
    revoked: bool = False    # 이 판정이 회수로 끝났는지


def _utc_of_local_day(day: str, plus: int = 0) -> str:
    """사내 날짜(서버 현지) 0시를 UTC ISO 로 — 퇴사일 · 사용 기간 끝 비교용입니다."""
    start = datetime.combine(date.fromisoformat(day) + timedelta(days=plus), time.min).astimezone()
    return start.astimezone(timezone.utc).isoformat(timespec="seconds")


def _min(*stamps: str | None) -> str | None:
    return min((s for s in stamps if s), default=None)


def collect(judged: dict[str, list[dict[str, Any]]], grants: dict[str, list[dict[str, Any]]], now: str) -> list[Item]:
    """judged = results.judgment_history, grants = permissions.grant_history."""
    items: list[Item] = []
    reviews = judged["reviews"]
    by_review: dict[int, list[dict[str, Any]]] = {}
    for i in judged["issues"]:
        by_review.setdefault(i["review_id"], []).append(i)
    for n, r in enumerate(reviews):
        ended = reviews[n + 1]["created_at"] if n + 1 < len(reviews) else None
        if r["failed"]:
            items.append(Item("policy", f"policy_reviews/{r['id']}", "정책 관리 검토", None, r["error"] or "", r["created_at"], ended))
        for i in by_review.get(r["id"], []):
            key = f"policy_issues/{i['id']}"
            items.append(Item("policy", key, " ↔ ".join(i["policy_ids"]) or i["kind"], i["level"], f"{i['kind']} — {i['reason']}",
                              r["created_at"], ended, key, policy_signature(i["kind"], i["level"], i["policy_ids"])))

    def lineage(rows: list[dict[str, Any]], group: str, make: Any) -> None:
        last: dict[str, Item] = {}
        for row in rows:
            item = make(row)
            if prev := last.get(row[group]):
                prev.ended = item.opened
            last[row[group]] = item
            items.append(item)

    def node(r: dict[str, Any]) -> Item:
        key = f"node_findings/{r['id']}"
        level = None if r["failed"] else r["level"]
        return Item("server", key, r["host"] or r["node"], level, r["error"] or "" if r["failed"] else r["summary"], r["created_at"],
                    decision=key, signature=server_signature(r["node"], r["level"], r["gaps"]))

    def suspect(r: dict[str, Any]) -> Item:
        key = f"suspect/{r['person']}"
        return Item("suspect", key, r["subject"] or r["person"], None if r["failed"] else SUSPECT_LEVEL.get(r["level"] or ""),
                    r["error"] or "" if r["failed"] else r["reason"], r["created_at"], decision=key)

    lineage(judged["nodes"], "node", node)
    lineage(judged["suspects"], "person", suspect)
    for r in judged["events"]:
        key = f"event_findings/{r['id']}"
        items.append(Item("event", key, r["subject"] or r["user"], None if r["failed"] else r["level"],
                          r["error"] or "" if r["failed"] else r["reason"], r["created_at"], decision=key))
    items.extend(_grant_items(grants, now))
    return items


def _grant_items(history: dict[str, list[dict[str, Any]]], now: str) -> list[Item]:
    """신청 뒤 이동마다 재검토 판정, 퇴사일부터는 코드가 위험 — 회수 · 사용 기간 끝에서 닫힙니다."""
    moves: dict[int, list[dict[str, Any]]] = {}
    for m in history["moves"]:
        moves.setdefault(m["user_id"], []).append(m)
    reviews: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for r in history["reviews"]:
        reviews.setdefault((r["request_id"], r["move_id"]), []).append(r)
    out: list[Item] = []
    for g in history["grants"]:
        subject = f"{g['requester_department']} {g['requester_name']} {g['requested_access']}".strip()
        key = f"grant/{g['request_no']}"
        limit = _min(g["revoked_at"], _utc_of_local_day(g["period_end"], 1) if g["period_end"] else None)
        leave = _utc_of_local_day(g["left_on"]) if g["left_on"] and _utc_of_local_day(g["left_on"]) <= now else None
        versions: list[tuple[str, str | None, str | None, str]] = []   # (열린 시각, 자연히 끝난 시각, 등급, 이유)
        after = [m for m in moves.get(g["requester_id"], []) if m["recorded_at"] > g["submitted_at"]]
        for n, m in enumerate(after):
            next_move = after[n + 1]["recorded_at"] if n + 1 < len(after) else None
            rs = reviews.get((g["id"], m["id"]), [])
            for k, r in enumerate(rs):
                end = _min(rs[k + 1]["judged_at"] if k + 1 < len(rs) else None, next_move, leave)
                versions.append((r["judged_at"], end, None if r["failed"] else r["level"], r["error"] or "" if r["failed"] else r["reason"]))
        if leave:
            versions.append((leave, None, "위험", f"{g['left_on']} 퇴사한 사람의 권한이 남아 있습니다"))
        for opened, end, level, reason in versions:
            if (limit and opened >= limit) or (end and end <= opened):
                continue
            revoked = bool(g["revoked_at"]) and opened <= g["revoked_at"] and (end is None or g["revoked_at"] < end)
            out.append(Item("grant", key, subject, level, reason, opened, _min(end, limit), revoked=revoked))
    return out


class Decisions:
    """kind → key → 결정 기록(오래된 것부터)으로 어느 시각의 결정을 찾습니다 — 결과가 같은 판정의 결정을 잇습니다."""

    def __init__(self, log: dict[str, dict[str, list[dict[str, Any]]]], items: list[Item]) -> None:
        self.records = {key: rs for rs_by_key in log.values() for key, rs in rs_by_key.items()}
        self.stamps = {key: [r["decided_at"] for r in rs] for key, rs in self.records.items()}
        self.same: dict[tuple, list[str]] = {}
        for item in items:
            if item.signature is not None and item.decision in self.records:
                self.same.setdefault(item.signature, []).append(item.decision)

    def _last(self, key: str, at: str) -> dict[str, Any] | None:
        n = bisect_right(self.stamps.get(key, []), at)
        return self.records[key][n - 1] if n else None

    def at(self, item: Item, at: str) -> dict[str, Any] | None:
        """그 시각의 지금 결정 (취소면 None)."""
        if not item.decision:
            return None
        if (own := self._last(item.decision, at)) is not None:
            return None if own["action"] == "cancel" else own
        found = [d for key in self.same.get(item.signature, ()) if key != item.decision
                 and (d := self._last(key, at)) is not None and d["action"] != "cancel"] if item.signature else []
        return max(found, key=lambda d: d["id"], default=None)


def state(item: Item, decisions: Decisions, at: str) -> tuple[str | None, dict[str, Any] | None]:
    """그 시각의 상태 — open(결정 없음) · acting(조치 필요로 정함) · done · cleared · failed · normal, 판정이 없던 때면 None."""
    if item.opened > at or (item.ended and item.ended <= at):
        return None, None
    d = decisions.at(item, at)
    action = d["action"] if d else None
    if action == "done":
        return "done", d
    if action in CLEARED:
        return "cleared", d
    if item.level is None:
        return "failed", d
    if item.level == "정상":
        return "normal", d
    return ("acting" if action else "open"), d


def _row(item: Item, d: dict[str, Any] | None) -> dict[str, Any]:
    return {"area": item.area, "area_label": AREAS[item.area], "key": item.key, "subject": item.subject, "level": item.level,
            "reason": item.reason[:REASON_CHARS], "opened_at": item.opened,
            "decision": {"action": d["action"], "label": ACTIONS[d["action"]], "by": d["decider_name"], "at": d["decided_at"]} if d else None}


def _days(first: str, now: datetime) -> list[tuple[str, str]]:
    """(사내 날짜, 그날 끝 UTC ISO) — first 가 든 날부터 오늘까지."""
    day, today = datetime.fromisoformat(first).astimezone().date(), now.astimezone().date()
    out = []
    while day <= today:
        out.append((day.isoformat(), _utc_of_local_day(day.isoformat(), 1)))
        day += timedelta(days=1)
    return out


Row = tuple[Item, str, "dict[str, Any] | None"]


def _now_open(items: list[Item], decisions: Decisions, at: str) -> tuple[list[Row], list[Row]]:
    """→ (조치 필요 — 결정 없음 · 조치 필요로 정함, 판정 실패)"""
    current = [(item, *state(item, decisions, at)) for item in items]
    return [r for r in current if r[1] in ("open", "acting")], [r for r in current if r[1] == "failed"]


def _ranked(rows: list[Row]) -> list[Row]:
    """위험 → 결정 없음 → 최근 순입니다."""
    out = sorted(rows, key=lambda x: x[0].opened, reverse=True)
    out.sort(key=lambda x: (x[0].level != "위험", x[1] != "open"))
    return out


def board(items: list[Item], log: dict[str, dict[str, list[dict[str, Any]]]], now: datetime,
          per_area: int) -> tuple[dict[str, list[dict[str, Any]]], str]:
    """AI 비서 입력 — 영역마다 열린 항목(per_area 건까지, 위험 → 결정 없음 → 최근 순)과 열린 것 · 결정 상태의 지문."""
    at = now.astimezone(timezone.utc).isoformat(timespec="seconds")
    opened, failed = _now_open(items, Decisions(log, items), at)
    out: dict[str, list[dict[str, Any]]] = {a: [] for a in AREAS}
    for i, s, d in _ranked(opened):
        if len(out[i.area]) < per_area:
            out[i.area].append({**_row(i, d), "state": s})
    marks = sorted(f"{i.key}|{i.level}|{s}|{d['action'] if d else ''}" for i, s, d in [*opened, *failed])
    return out, hashlib.sha256("\n".join(marks).encode()).hexdigest()[:16]


def summarize(items: list[Item], log: dict[str, dict[str, list[dict[str, Any]]]], revoked_list: list[dict[str, Any]],
              now: datetime, since: str | None) -> dict[str, Any]:
    """log = kind → 결정 key → 결정 기록, revoked_list = revokes(). 열린 것은 기간과 무관, 완료율 · 추이는 since 부터입니다."""
    at = now.astimezone(timezone.utc).isoformat(timespec="seconds")
    decisions = Decisions(log, items)
    opened, failed = _now_open(items, decisions, at)

    areas = {a: {"area": a, "label": label, "위험": 0, "주의": 0, "failed": 0} for a, label in AREAS.items()}
    for i, _, _ in opened:
        areas[i.area][i.level] += 1
    for i, _, _ in failed:
        areas[i.area]["failed"] += 1

    # 완료 = 기간 안에 조치 완료로 정해 지금도 그대로인 항목(이어받은 판정은 원래 key 하나로) + 기간 안의 회수.
    done_list = [(kind, key, records[-1]) for kind, rs in log.items() for key, records in rs.items()
                 if records[-1]["action"] == "done" and (not since or records[-1]["decided_at"] >= since)]
    revoked = [r for r in revoked_list if r["level"] in ("주의", "위험") and (not since or r["revoked_at"] >= since)]
    done = len(done_list) + len(revoked)
    waiting = len(opened)

    first = since or min((i.opened for i in items), default=None)
    trend = []
    for day, end in _days(first, now) if first else []:
        counts = {"위험": 0, "주의": 0}
        for item in items:
            if item.level in counts and item.opened <= end and not (item.ended and item.ended <= end):
                if state(item, decisions, end)[0] in ("open", "acting"):
                    counts[item.level] += 1
        trend.append({"day": day, **counts})

    top = _ranked(opened)
    by_decision = {i.decision: i for i in items if i.decision}
    recent = [{"area": kind, "area_label": AREAS[kind], "key": key, "subject": by_decision[key].subject if key in by_decision else d["subject"],
               "at": d["decided_at"], "label": ACTIONS["done"], "by": d["decider_name"], "note": d["comment"]} for kind, key, d in done_list]
    recent += [{"area": "grant", "area_label": AREAS["grant"], "key": r["key"], "subject": r["subject"], "at": r["revoked_at"],
                "label": "회수", "by": r["by"], "note": r["note"]} for r in revoked]
    recent.sort(key=lambda r: r["at"], reverse=True)

    return {
        "generated_at": at, "since": since,
        "counts": {"위험": sum(a["위험"] for a in areas.values()), "주의": sum(a["주의"] for a in areas.values()),
                   "action": {"total": waiting, "undecided": sum(s == "open" for _, s, _ in opened),
                              "acting": sum(s == "acting" for _, s, _ in opened)},
                   "completion": {"done": done, "waiting": waiting, "rate": round(done / (done + waiting) * 100) if done + waiting else None},
                   "failed": len(failed)},
        "areas": list(areas.values()),
        "trend": trend,
        "top": [_row(i, d) for i, _, d in top],
        "failed": [_row(i, d) for i, _, d in failed],
        "recent": recent[:RECENT],   # 완료로 센 것 — 늦은 것부터
    }


def revokes(items: list[Item], grants: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """회수 기록 — level 은 회수로 끝난 재검토 판정의 등급입니다 (판정 없이 회수했으면 None)."""
    level = {i.key: i.level for i in items if i.area == "grant" and i.revoked}
    return [{"key": f"grant/{g['request_no']}", "subject": f"{g['requester_department']} {g['requester_name']} {g['requested_access']}".strip(),
             "revoked_at": g["revoked_at"], "by": g["revoker_name"] or None, "note": g["revoke_reason"] or "",
             "level": level.get(f"grant/{g['request_no']}")} for g in grants["grants"] if g["revoked_at"]]


__all__ = ["AREAS", "Decisions", "Item", "board", "collect", "revokes", "state", "summarize"]
