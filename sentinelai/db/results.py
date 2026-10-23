"""AI 결과 DB — 정책 관리 검토 · 로그 감시 판정 · 질의 기록.

pipeline 이 돌려준 dict 를 그대로 받아 쌓습니다. 행은 고치지 않습니다 (트리거).
수집 노드가 보낸 수집(server_snapshots, 노드 · 수집 시각이 같으면 한 번만)과 노드 점검 판정(node_findings)도 여기 쌓습니다.
권한 DB의 운영자 결정은 여기 행을 `policy_issues/{id}` · `node_findings/{id}` · `event_findings/{id}` 로 가리킵니다.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from .auth import User
from .core import Database, now


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _utc(stamp: str | None) -> str | None:
    """시각을 UTC ISO 문자열로 맞춥니다. 문자열 비교가 곧 시각 비교가 되도록 합니다. 시간대가 없으면 UTC 로 봅니다."""
    if not stamp:
        return None
    moment = datetime.fromisoformat(stamp)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


# --- 정책 관리 검토 -----------------------------------------------------------


def save_policy_review(db: Database, review: dict[str, Any], model: str) -> int:
    """pipeline.review_policies 결과 1회를 쌓습니다. → policy_reviews.id"""
    with db.transaction() as conn:
        servers = review.get("servers") or {}
        rid = conn.execute(
            "INSERT INTO policy_reviews (source, load_issues, rules, summary, failed, error, model, elapsed_sec, created_at,"
            " servers_source, servers_load_issues) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (str(review.get("source", "")), _json(review.get("load_issues", [])), _json(review.get("rules", [])),
             review.get("summary", ""), int(review["failed"]), review.get("error"), model, review.get("elapsed_sec"), now(),
             str(servers.get("source", "")), _json(servers.get("load_issues", []))),
        ).lastrowid
        # 서버 점검은 차이(gaps)마다 근거 조항 · 바꿀 것을 따로 둡니다. reason 에는 요약, sources 에는 차이들의 조항을 모읍니다.
        conn.executemany(
            "INSERT INTO server_findings (review_id, seq, host, ip, state, matched, level, reason, recommendation, sources,"
            " failed, error, elapsed_sec, gaps, unjudged, snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(rid, n, f["host"], f.get("ip", ""), _json(f.get("state", {})), f.get("matched", ""), f.get("level"),
              f.get("summary", ""), "", _json(list(dict.fromkeys(g["source"] for g in f.get("gaps", []) if g.get("source")))),
              int(f["failed"]), f.get("error"), f.get("elapsed_sec"), _json(f.get("gaps", [])), _json(f.get("unjudged", [])),
              _json(f.get("snapshot") or {}))
             for n, f in enumerate(servers.get("findings", []), start=1)],
        )
        conn.executemany(
            "INSERT INTO policy_issues (review_id, seq, kind, level, policy_ids, reason, recommendation) VALUES (?,?,?,?,?,?,?)",
            [(rid, n, i["kind"], i["level"], _json(i.get("policy_ids", [])), i.get("reason", ""), i.get("recommendation", ""))
             for n, i in enumerate(review.get("issues", []), start=1)],
        )
    return rid


def latest_policy_review(db: Database) -> dict[str, Any] | None:
    """마지막 정책 관리 검토 — 정책 문제 목록과 서버 점검. 항목마다 운영자 결정이 가리킬 key 를 붙입니다."""
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM policy_reviews ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            return None
        issues = conn.execute("SELECT * FROM policy_issues WHERE review_id = ? ORDER BY seq", (row["id"],)).fetchall()
        servers = conn.execute("SELECT * FROM server_findings WHERE review_id = ? ORDER BY seq", (row["id"],)).fetchall()
    return {
        "id": row["id"],
        "generated_at": row["created_at"],
        "source": row["source"],
        "load_issues": json.loads(row["load_issues"]),
        "rules": json.loads(row["rules"]),
        "summary": row["summary"],
        "failed": bool(row["failed"]),
        "error": row["error"],
        "model": row["model"],
        "elapsed_sec": row["elapsed_sec"],
        "issues": [
            {"key": f"policy_issues/{i['id']}", "seq": i["seq"], "kind": i["kind"], "level": i["level"],
             "policy_ids": json.loads(i["policy_ids"]), "reason": i["reason"], "recommendation": i["recommendation"]}
            for i in issues
        ],
        "servers": {
            "source": row["servers_source"],
            "load_issues": json.loads(row["servers_load_issues"]),
            "findings": [
                {"key": f"server_findings/{s['id']}", "seq": s["seq"], "host": s["host"], "ip": s["ip"],
                 "state": json.loads(s["state"]), "matched": s["matched"], "level": s["level"], "reason": s["reason"],
                 "recommendation": s["recommendation"], "sources": json.loads(s["sources"]), "failed": bool(s["failed"]),
                 "error": s["error"], "elapsed_sec": s["elapsed_sec"], "gaps": json.loads(s["gaps"]),
                 "unjudged": json.loads(s["unjudged"]), "snapshot": json.loads(s["snapshot"])}
                for s in servers
            ],
        },
    }


# --- 수집 노드 -----------------------------------------------------------------


def _snapshot(r: Any) -> dict[str, Any]:
    return {"id": r["id"], "node": r["node"], "host": r["host"], "ip": r["ip"], "collected_at": r["collected_at"],
            "collected_by": r["collected_by"], "modules": json.loads(r["modules"]), "changes": json.loads(r["changes"])}


def latest_snapshot(db: Database, node: str) -> dict[str, Any] | None:
    """이 노드의 가장 늦은 수집 — 다음 수집의 바뀐 것을 셀 때 견줍니다."""
    with db.connection() as conn:
        r = conn.execute("SELECT * FROM server_snapshots WHERE node = ? ORDER BY collected_at DESC LIMIT 1", (node,)).fetchone()
    return _snapshot(r) if r else None


def save_snapshot(db: Database, snap: dict[str, Any]) -> tuple[int | None, bool]:
    """pipeline.snapshot_row 가 만든 수집 기록 한 건. 같은 노드 · 수집 시각이 이미 있으면 넣지 않습니다. → (id, 넣었는지)"""
    with db.transaction() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO server_snapshots (node, host, ip, collected_at, collected_by, file, modules, sections, changes, loaded_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (snap["node"], snap["host"], snap.get("ip", ""), _utc(snap["collected_at"]), snap.get("collected_by", ""), "",
             _json(snap.get("modules", {})), _json(snap.get("sections", {})), _json(snap.get("changes", [])), now()),
        )
        if cur.rowcount:
            return cur.lastrowid, True
        r = conn.execute("SELECT id FROM server_snapshots WHERE node = ? AND collected_at = ?",
                         (snap["node"], _utc(snap["collected_at"]))).fetchone()
        return (r["id"] if r else None), False


def pending_snapshots(db: Database, nodes: set[str]) -> list[dict[str, Any]]:
    """점검할 차례 — 노드마다 가장 늦은 수집 중 아직 판정하지 않은 것. 그사이 여러 번 왔어도 마지막 것만 봅니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT s.* FROM server_snapshots s WHERE s.node <> ''"
            " AND s.collected_at = (SELECT max(collected_at) FROM server_snapshots WHERE node = s.node)"
            " AND NOT EXISTS (SELECT 1 FROM node_findings f WHERE f.snapshot_id = s.id) ORDER BY s.node"
        ).fetchall()
    return [_snapshot(r) for r in rows if r["node"] in nodes]


def save_node_finding(db: Database, f: dict[str, Any], model: str) -> int:
    """pipeline.check_nodes 의 판정 한 건. 쌓기만 합니다."""
    with db.transaction() as conn:
        return conn.execute(
            "INSERT INTO node_findings (node, snapshot_id, host, ip, state, matched, level, summary, gaps, unjudged, sources,"
            " failed, error, elapsed_sec, model, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (f["node"], f["snapshot_id"], f.get("host", ""), f.get("ip", ""), _json(f.get("state", {})), f.get("matched", ""),
             f.get("level"), f.get("summary", ""), _json(f.get("gaps", [])), _json(f.get("unjudged", [])),
             _json(list(dict.fromkeys(g["source"] for g in f.get("gaps", []) if g.get("source")))),
             int(f["failed"]), f.get("error"), f.get("elapsed_sec"), model, now()),
        ).lastrowid


def latest_node_findings(db: Database) -> list[dict[str, Any]]:
    """노드마다 마지막 판정과 그때 본 수집 — 정책 관리 화면의 서버 점검. 운영자 결정은 `node_findings/{id}` 를 가리킵니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT f.*, s.collected_at, s.collected_by, s.modules, s.changes FROM node_findings f"
            " JOIN server_snapshots s ON s.id = f.snapshot_id"
            " WHERE f.id = (SELECT max(id) FROM node_findings WHERE node = f.node) ORDER BY f.node"
        ).fetchall()
    return [{"key": f"node_findings/{r['id']}", "node": r["node"], "host": r["host"], "ip": r["ip"],
             "state": json.loads(r["state"]), "matched": r["matched"], "level": r["level"], "summary": r["summary"],
             "gaps": json.loads(r["gaps"]), "unjudged": json.loads(r["unjudged"]), "sources": json.loads(r["sources"]),
             "failed": bool(r["failed"]), "error": r["error"], "elapsed_sec": r["elapsed_sec"], "created_at": r["created_at"],
             "snapshot": {"collected_at": r["collected_at"], "collected_by": r["collected_by"],
                          "modules": json.loads(r["modules"]), "changes": json.loads(r["changes"])}}
            for r in rows]


def node_history(db: Database, node: str, limit: int = 20) -> dict[str, Any]:
    """노드 화면 — 최근 수집(바뀐 것) · 판정 등급 기록과 가장 늦은 수집의 모듈 상태."""
    with db.connection() as conn:
        snaps = conn.execute("SELECT * FROM server_snapshots WHERE node = ? ORDER BY collected_at DESC LIMIT ?", (node, limit)).fetchall()
        findings = conn.execute("SELECT f.id, f.snapshot_id, f.level, f.failed, f.summary, f.created_at FROM node_findings f"
                                " WHERE f.node = ? ORDER BY f.id DESC LIMIT ?", (node, limit)).fetchall()
    return {
        "latest": _snapshot(snaps[0]) if snaps else None,
        "snapshots": [{"id": r["id"], "collected_at": r["collected_at"], "changes": json.loads(r["changes"])} for r in snaps],
        "findings": [{"key": f"node_findings/{r['id']}", "snapshot_id": r["snapshot_id"], "level": r["level"],
                      "failed": bool(r["failed"]), "summary": r["summary"], "created_at": r["created_at"]} for r in findings],
    }


def server_history(db: Database, nodes: list[str], since: str | None = None, until: str | None = None) -> dict[str, Any]:
    """서버 질의 — 고른 노드들의 기간 안 수집(바뀐 것) · 판정 기록, 오래된 것부터. 기간이 없으면 처음부터 끝까지입니다."""
    if not nodes:
        return {"snapshots": [], "findings": []}
    marks = ",".join("?" * len(nodes))
    where, args = f"node IN ({marks})", list(nodes)
    if since:
        where += " AND {at} >= ?"; args.append(_utc(since))
    if until:
        where += " AND {at} <= ?"; args.append(_utc(until))
    with db.connection() as conn:
        snaps = conn.execute(f"SELECT node, collected_at, changes FROM server_snapshots WHERE {where.format(at='collected_at')}"
                             " ORDER BY collected_at", args).fetchall()
        findings = conn.execute(f"SELECT id, node, level, failed, summary, gaps, created_at FROM node_findings"
                                f" WHERE {where.format(at='created_at')} ORDER BY created_at", args).fetchall()
    return {
        "snapshots": [{"node": r["node"], "collected_at": r["collected_at"], "changes": json.loads(r["changes"])} for r in snaps],
        "findings": [{"node": r["node"], "level": r["level"], "failed": bool(r["failed"]), "summary": r["summary"],
                      "gaps": json.loads(r["gaps"]), "created_at": r["created_at"]} for r in findings],
    }


# --- 보안 통계 ---------------------------------------------------------------
# 모델 없이 쌓인 판정을 셉니다. 날짜는 화면과 같은 서버 현지 날짜(KST)로 묶습니다.

LEVEL_ORDER = {"정상": 0, "주의": 1, "위험": 2}
_FINAL = "run_id IN (SELECT id FROM monitor_runs WHERE stage = 'final')"
# 판정에 묶인 로그 한 줄 (SecurityEvent.describe). 판정 하나가 몇 주에 걸친 로그를 묶으므로 줄마다 자기 시각으로 셉니다.
_EVENT_LINE = re.compile(r"^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) UTC", re.M)
_MODULE = re.compile(r"^\[([^\]]+)\]")


def _day(stamp: str) -> str:
    return datetime.fromisoformat(stamp).astimezone().date().isoformat()


def threat_stats(db: Database, since: str | None = None) -> dict[str, Any]:
    """보안 통계 — 로그 감시(주의 · 위험 판정에 묶인 로그 줄 · 날짜별 빈도 · 반복 사용자)와
    서버 점검(노드별 등급 변화 · 모듈별 위협 항목 · 걸린 조항). since 가 없으면 전체."""
    at = _utc(since)
    with db.connection() as conn:
        # 통계 · 의심 점수는 정밀 감시(확정)만 셉니다. 빠른 감시의 1차 판정은 같은 로그를 다시 판정하기 전의 값이라 세면 겹칩니다.
        events = conn.execute(f"SELECT id, user, subject, level, failed, events, last_event_at FROM event_findings WHERE {_FINAL}"
                              + (" AND last_event_at >= ?" if at else "") + " ORDER BY last_event_at", (at,) if at else ()).fetchall()
        findings = conn.execute("SELECT id, node, level, failed, gaps, created_at FROM node_findings"
                                + (" WHERE created_at >= ?" if at else "") + " ORDER BY created_at, id", (at,) if at else ()).fetchall()
        snaps = conn.execute("SELECT node, count(*) AS n, sum(changes <> '[]') AS changed FROM server_snapshots WHERE node <> ''"
                             + (" AND collected_at >= ?" if at else "") + " GROUP BY node", (at,) if at else ()).fetchall()

    # 판정 실패는 화면과 같이 "주의"로 셉니다 (확인하지 못한 것을 정상으로 두지 않습니다).
    level = lambda r: "주의" if r["failed"] else r["level"]  # noqa: E731
    users: dict[str, dict[str, Any]] = {}
    days: dict[str, dict[str, int]] = {}
    lines = {"정상": 0, "주의": 0, "위험": 0}
    for r in events:
        lv = level(r)
        stamps = [m for m in _EVENT_LINE.findall(r["events"]) if not at or f"{m.replace(' ', 'T')}+00:00" >= at]
        lines[lv] += len(stamps)
        if lv == "정상":
            continue
        for m in stamps:
            d = days.setdefault(_day(f"{m.replace(' ', 'T')}+00:00"), {"주의": 0, "위험": 0})
            d[lv] += 1
        who = r["subject"] or r["user"]
        u = users.setdefault(who, {"user": who, "log_id": r["user"], "주의": 0, "위험": 0, "lines": 0, "line_levels": {"주의": 0, "위험": 0},
                                   "last_at": "", "keys": []})
        u[lv] += 1
        u["lines"] += len(stamps)
        u["line_levels"][lv] += len(stamps)
        u["last_at"] = max(u["last_at"], r["last_event_at"])
        u["keys"].append(f"event_findings/{r['id']}")

    nodes: dict[str, dict[str, Any]] = {}
    for r in findings:
        n = nodes.setdefault(r["node"], {"node": r["node"], "grades": [], "collected": 0, "changed": 0})
        n["grades"].append({"level": level(r), "at": r["created_at"], "key": f"node_findings/{r['id']}"})
        n["gaps"] = [g for g in json.loads(r["gaps"]) if g.get("level") in ("주의", "위험")]
    for r in snaps:
        n = nodes.setdefault(r["node"], {"node": r["node"], "grades": [], "collected": 0, "changed": 0, "gaps": []})
        n["collected"], n["changed"] = r["n"], r["changed"] or 0
    clauses: dict[str, dict[str, Any]] = {}
    modules: dict[str, dict[str, Any]] = {}
    for n in nodes.values():
        first, last = (n["grades"][0]["level"], n["grades"][-1]["level"]) if n["grades"] else (None, None)
        diff = LEVEL_ORDER[last] - LEVEL_ORDER[first] if first else 0
        n["trend"] = "판정 없음" if not first else "나빠짐" if diff > 0 else "좋아짐" if diff < 0 else "그대로"
        n["level"] = last
        # 위협 항목 · 조항은 노드마다 기간 안 마지막 판정만 셉니다. 자주 점검한 노드가 건수를 부풀리지 않게 합니다.
        n["threats"] = {"주의": 0, "위험": 0}
        for g in n.pop("gaps", []):
            item = g.get("item", "")
            n["threats"][g["level"]] += 1
            m = _MODULE.match(item)
            mod = modules.setdefault(m.group(1) if m else "기타", {"module": m.group(1) if m else "기타", "주의": 0, "위험": 0, "nodes": [], "items": []})
            mod[g["level"]] += 1
            if n["node"] not in mod["nodes"]:
                mod["nodes"].append(n["node"])
            mod["items"].append(f"{n['node']} — {item}: {g.get('current', '')} ({g['level']})")
            source = (g.get("source") or "근거 없음").strip()
            c = clauses.setdefault(source, {"source": source, "nodes": [], "items": []})
            if n["node"] not in c["nodes"]:
                c["nodes"].append(n["node"])
            c["items"].append(f"{n['node']} — {item}")
    return {
        "events": {"lines": lines,
                   "users": sorted(users.values(), key=lambda u: (-u["위험"], -u["주의"], u["user"])),
                   "days": [{"day": d, **v} for d, v in sorted(days.items())]},
        "servers": {"nodes": sorted(nodes.values(), key=lambda n: (-LEVEL_ORDER.get(n["level"] or "", -1), n["node"])),
                    "modules": sorted(modules.values(), key=lambda m: (-m["위험"], -m["주의"], m["module"])),
                    "clauses": sorted(clauses.values(), key=lambda c: (-len(c["nodes"]), c["source"]))},
    }


# 안전 점수 — 대상(노드 · 사람)마다 마지막 등급을 값으로 바꿔 평균 × 100. 감점식 대신 등급 비율이라 무엇이 점수를 깎았는지 그대로 보입니다.
SERVER_SAFETY = {"정상": 1.0, "주의": 0.5, "위험": 0.0}
USER_SAFETY = {"낮음": 1.0, "보통": 0.5, "높음": 0.0}


def _score(values: list[float]) -> int | None:
    return round(sum(values) / len(values) * 100) if values else None


def _daily_scores(rows: list[tuple[str, str, float]], since: str | None) -> list[dict[str, Any]]:
    """(시각, 대상, 값) → 날짜(서버 현지)마다 그날이 끝날 때 대상별 마지막 값의 안전 점수. since 가 없으면 첫 기록 날부터."""
    if not rows:
        return []
    first = datetime.fromisoformat(since or rows[0][0]).astimezone().date()
    today = datetime.now().astimezone().date()
    last: dict[str, float] = {}
    out, i = [], 0
    day = first
    while day <= today:
        end = datetime.combine(day + timedelta(days=1), datetime.min.time()).astimezone().astimezone(timezone.utc).isoformat(timespec="seconds")
        while i < len(rows) and rows[i][0] < end:
            last[rows[i][1]] = rows[i][2]
            i += 1
        if last:
            out.append({"day": day.isoformat(), "score": _score(list(last.values()))})
        day += timedelta(days=1)
    return out


def server_safety(db: Database, enabled: list[str], stale: set[str], since: str | None = None) -> dict[str, Any]:
    """시스템 안전 점수 — 켜 둔 노드마다 마지막 서버 점검 등급(판정 실패는 주의). 끊긴 노드는 지금 상태를 확인할 수 없어 주의보다 높게 치지 않습니다.
    판정이 아직 없는 노드는 점수에서 빼고 따로 셉니다. 흐름은 날짜마다 그날까지의 마지막 등급으로 다시 셉니다 (끊김은 지금 값에만)."""
    with db.connection() as conn:
        rows = conn.execute("SELECT node, level, failed, created_at FROM node_findings ORDER BY created_at, id").fetchall()
    on = set(enabled)
    history = [(r["created_at"], r["node"], SERVER_SAFETY["주의" if r["failed"] else r["level"]]) for r in rows if r["node"] in on]
    latest = {r["node"]: "주의" if r["failed"] else r["level"] for r in rows if r["node"] in on}
    items = []
    for name in sorted(on):
        level = latest.get(name)
        items.append({"node": name, "level": level, "stale": name in stale})
    values = [min(SERVER_SAFETY[i["level"]], 0.5) if i["stale"] else SERVER_SAFETY[i["level"]] for i in items if i["level"]]
    score = _score(values)
    trend = _daily_scores(history, _utc(since))
    if trend and score is not None:
        trend[-1]["score"] = score
    return {"score": score, "items": items, "trend": trend}


def user_safety(db: Database, since: str | None = None) -> dict[str, Any]:
    """사용자 안전 점수 — 의심 점수를 받은 사람마다 마지막 의심 등급 (예측 실패는 빼고 그 앞 것). 흐름은 날짜마다 그날까지의 마지막 등급으로."""
    with db.connection() as conn:
        rows = conn.execute("SELECT person, level, created_at FROM suspect_scores WHERE failed = 0 ORDER BY created_at, id").fetchall()
    history = [(r["created_at"], r["person"], USER_SAFETY[r["level"]]) for r in rows if r["level"] in USER_SAFETY]
    latest = {person: value for _, person, value in history}
    return {"score": _score(list(latest.values())), "trend": _daily_scores(history, _utc(since))}


def user_findings(db: Database, since: str | None = None) -> list[dict[str, Any]]:
    """의심 점수 — 기간 안 로그 감시 판정을 로그 사용자 ID(user)별로. 묶인 로그 줄 수와 판정 시각(마지막 로그)을 함께 줍니다."""
    at = _utc(since)
    with db.connection() as conn:
        rows = conn.execute(f"SELECT id, user, subject, level, failed, reason, events, last_event_at FROM event_findings WHERE {_FINAL}"
                            + (" AND last_event_at >= ?" if at else "") + " ORDER BY last_event_at", (at,) if at else ()).fetchall()
    return [{"key": f"event_findings/{r['id']}", "log_id": r["user"], "subject": r["subject"], "level": "주의" if r["failed"] else r["level"],
             "failed": bool(r["failed"]), "reason": r["reason"], "lines": len(_EVENT_LINE.findall(r["events"])), "at": r["last_event_at"]}
            for r in rows]


def save_suspect(db: Database, person: dict[str, Any], result: dict[str, Any], model: str) -> int:
    """사용자 한 명의 의심 점수 한 건 (pipeline.predict_suspect). 쌓기만 하고 화면은 사람마다 마지막 것과 흐름을 봅니다."""
    records = {"로그 위험": sum(f["level"] == "위험" for f in person["findings"]), "로그 주의": sum(f["level"] == "주의" for f in person["findings"]),
               "신청": len(person["requests"]), "신청 위험": sum(r["ai"] == "위험" for r in person["requests"]),
               "반려": sum(bool(r["rejected_by"]) for r in person["requests"]), "회수": sum(r["stage"] == "revoked" for r in person["requests"])}
    with db.transaction() as conn:
        return conn.execute(
            "INSERT INTO suspect_scores (person, subject, log_id, login_id, score, level, reason, watch, signals, records, failed, error,"
            " elapsed_sec, model, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (person["key"], f"{person['department']} {person['name']}".strip(), person["log_id"] or "", person["login_id"],
             result.get("score"), result.get("level"), result.get("reason", ""), result.get("watch", ""),
             _json(person["signals"] or {}), _json(records), int(result["failed"]), result.get("error"), result.get("elapsed_sec"), model, now()),
        ).lastrowid


def latest_suspects(db: Database, history: int = 12) -> list[dict[str, Any]]:
    """사람마다 마지막 의심 점수와 그 앞 점수 흐름(오래된 것부터 history 개), 높은 순."""
    with db.connection() as conn:
        rows = conn.execute("SELECT * FROM suspect_scores ORDER BY person, id").fetchall()
    people: dict[str, list[Any]] = {}
    for r in rows:
        people.setdefault(r["person"], []).append(r)
    out = []
    for key, rs in people.items():
        last = rs[-1]
        out.append({"key": key, "subject": last["subject"], "log_id": last["log_id"], "login_id": last["login_id"],
                    "score": last["score"], "level": last["level"], "reason": last["reason"], "watch": last["watch"],
                    "signals": json.loads(last["signals"]), "records": json.loads(last["records"]),
                    "failed": bool(last["failed"]), "error": last["error"], "created_at": last["created_at"], "model": last["model"],
                    "trend": [{"score": r["score"], "at": r["created_at"]} for r in rs[-history:] if not r["failed"]]})
    return sorted(out, key=lambda p: (-(p["score"] or 0), p["subject"]))


# --- 로그 감시 ---------------------------------------------------------------


def save_monitor_run(db: Database, run: dict[str, Any], model: str,
                     since: str | None = None, until: str | None = None, stage: str = "final") -> int:
    """pipeline.monitor 결과 1회를 쌓습니다. stage = final(정밀 감시, 생각 켬) · fast(빠른 감시, 1차 판정). → monitor_runs.id"""
    with db.transaction() as conn:
        rid = conn.execute(
            "INSERT INTO monitor_runs (source, load_issues, since, until, last_event_at, model, created_at, stage) VALUES (?,?,?,?,?,?,?,?)",
            (str(run.get("source", "")), _json(run.get("load_issues", [])), _utc(since), _utc(until),
             _utc(run.get("last_event_at")), model, now(), stage),
        ).lastrowid
        conn.executemany(
            "INSERT INTO event_findings (run_id, user, subject, first_event_at, last_event_at, events, level, reason,"
            " recommendation, sources, failed, error, elapsed_sec) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(rid, f["user"], f.get("subject", ""), _utc(f["first_event_at"]), _utc(f["last_event_at"]), f.get("events", ""),
              f.get("level"), f.get("reason", ""), f.get("recommendation", ""), _json(f.get("sources", [])),
              int(f["failed"]), f.get("error"), f.get("elapsed_sec"))
             for f in run.get("findings", [])],
        )
    return rid


def next_monitor_since(db: Database, stage: str = "final") -> datetime | None:
    """다음 로그 감시의 시작점 — 그 단계가 지금까지 읽은 로그 중 가장 늦은 시각. 감시한 적이 없으면 None.

    빠른 감시는 정밀 감시보다 뒤로 가지 않습니다 (정밀 감시가 이미 확정한 구간을 1차 판정으로 다시 띄우지 않게).
    """
    with db.connection() as conn:
        last = conn.execute("SELECT max(last_event_at) FROM monitor_runs WHERE stage = ?", (stage,)).fetchone()[0]
        if stage == "fast":
            final = conn.execute("SELECT max(last_event_at) FROM monitor_runs WHERE stage = 'final'").fetchone()[0]
            last = max(filter(None, (last, final)), default=None)
    return datetime.fromisoformat(last) if last else None


def monitor_findings(db: Database) -> dict[str, Any] | None:
    """정밀 감시(확정) 판정 전부 + 정밀 감시가 아직 닿지 않은 구간의 빠른 감시 1차 판정. 감시한 적이 없으면 None.

    정밀 감시가 그 구간을 다시 판정하면 1차 판정은 목록에서 빠집니다 (AI 결과 DB 에는 남습니다).
    """
    with db.connection() as conn:
        run = conn.execute("SELECT * FROM monitor_runs ORDER BY id DESC LIMIT 1").fetchone()
        if run is None:
            return None
        last = conn.execute("SELECT max(last_event_at) FROM monitor_runs").fetchone()[0]
        final = conn.execute("SELECT max(last_event_at) FROM monitor_runs WHERE stage = 'final'").fetchone()[0]
        rows = conn.execute(
            "SELECT f.*, m.stage FROM event_findings f JOIN monitor_runs m ON m.id = f.run_id"
            " WHERE m.stage = 'final' OR f.first_event_at > coalesce(?, '') ORDER BY f.id", (final,)).fetchall()
    return {
        "generated_at": run["created_at"],
        "source": run["source"],
        "load_issues": json.loads(run["load_issues"]),
        "last_event_at": last,
        "findings": [
            {"key": f"event_findings/{r['id']}", "id": f"{r['user']}@{r['last_event_at']}", "user": r["user"],
             "subject": r["subject"], "first_event_at": r["first_event_at"], "last_event_at": r["last_event_at"],
             "events": r["events"], "level": r["level"], "reason": r["reason"], "recommendation": r["recommendation"],
             "sources": json.loads(r["sources"]), "failed": bool(r["failed"]), "error": r["error"],
             "elapsed_sec": r["elapsed_sec"], "stage": r["stage"]}
            for r in rows
        ],
    }


# --- 질의 기록 ---------------------------------------------------------------

QA_KINDS = ("policy", "logs", "servers")


def save_qa(db: Database, kind: str, question: str, result: dict[str, Any], model: str, asker: User) -> int:
    """정책 질의(rag_chain 의 Answer) · 로그 질의(pipeline.ask_logs) 1건을 남깁니다."""
    if kind not in QA_KINDS:
        raise ValueError(f"kind 는 {', '.join(QA_KINDS)} 중 하나입니다")
    with db.transaction() as conn:
        return conn.execute(
            "INSERT INTO qa_records (kind, question, answer, sources, criteria, facts, evidence, failed, error, model,"
            " elapsed_sec, asker_id, asker_name, asker_department, asked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (kind, question, result.get("answer", ""), _json(result.get("sources", [])), _json(result.get("criteria", {})),
             _json(result["facts"]) if result.get("facts") is not None else None, _json(result.get("evidence", [])),
             int(bool(result.get("failed"))), result.get("error"), model, result.get("elapsed_sec"),
             asker.id, asker.display_name, asker.department, now()),
        ).lastrowid


def my_qa(db: Database, asker: User, kind: str, limit: int = 50) -> list[dict[str, Any]]:
    """내 질의 기록 (최근 것부터). 다른 사람의 기록은 돌려주지 않습니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT * FROM qa_records WHERE asker_id = ? AND kind = ? ORDER BY id DESC LIMIT ?", (asker.id, kind, limit)
        ).fetchall()
    out = []
    for r in rows:
        record = dict(r)
        for k in ("sources", "criteria", "evidence"):
            record[k] = json.loads(record[k])
        record["facts"] = json.loads(record["facts"]) if record["facts"] is not None else None
        record["failed"] = bool(record["failed"])
        out.append(record)
    return out
